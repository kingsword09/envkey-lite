import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { validator } from 'hono/validator'
import { EnvironmentVariableService, SetVariableOptions, ExportFormat, ImportFormat } from '../services/environment.service'
import { ProjectService } from '../services/project.service'
import { DatabaseManager } from '../db/manager'
import { 
  createAuthMiddleware, 
  getCurrentUser,
  createAPIKeyAuthMiddleware
} from '../middleware/auth.middleware'
import { UserService } from '../services/user.service'
import { CryptoService } from '../services/crypto.service'
import { AuditService } from '../services/audit.service'
import { errorHandler } from '../middleware/error.middleware'

/**
 * Environment Variables API routes
 * Handles CRUD operations, batch operations, import/export, and client API access
 */
export function createEnvironmentRoutes(
  dbManager: DatabaseManager,
  cryptoService: CryptoService,
  jwtSecret: string
): Hono {
  const app = new Hono()
  const environmentService = new EnvironmentVariableService(dbManager, cryptoService)
  const projectService = new ProjectService(dbManager)
  const userService = new UserService(dbManager, cryptoService)
  const auditService = new AuditService(dbManager)
  
  // Set up error handler
  app.onError(errorHandler)
  
  // Create auth middleware
  const authMiddleware = createAuthMiddleware({
    jwtSecret,
    userService
  })

  const apiKeyMiddleware = createAPIKeyAuthMiddleware({
    userService
  })

  // Helper function to check environment access
  const checkEnvironmentAccess = async (
    userId: string, 
    environmentId: string, 
    requiredRole: 'viewer' | 'editor' | 'admin' = 'viewer'
  ): Promise<{ id: string; name: string; projectId: string; createdAt: Date; updatedAt: Date }> => {
    // Get environment to find project
    const environment = await projectService.getEnvironment(environmentId)
    if (!environment) {
      throw new HTTPException(404, { message: 'Environment not found' })
    }

    // Check project permission
    const hasPermission = await projectService.checkPermission(userId, environment.projectId, requiredRole)
    if (!hasPermission) {
      throw new HTTPException(403, { message: 'Access denied to this environment' })
    }

    return environment
  }

  // Apply authentication to all routes except client API
  app.use('/environments/*', authMiddleware)

  // Get all variables for an environment
  app.get('/environments/:environmentId/variables', async (c) => {
    try {
      const user = getCurrentUser(c)
      if (!user) {
        throw new HTTPException(401, { message: 'Authentication required' })
      }
      
      const environmentId = c.req.param('environmentId')
      if (!environmentId) {
        throw new HTTPException(400, { message: 'Environment ID is required' })
      }

      // Check access
      await checkEnvironmentAccess(user.id, environmentId, 'viewer')

      // Get query parameters
      const pattern = c.req.query('pattern')
      const prefix = c.req.query('prefix')

      let variables
      if (prefix) {
        variables = await environmentService.getVariablesByPrefix(environmentId, prefix)
      } else if (pattern) {
        variables = await environmentService.searchVariables(environmentId, pattern)
      } else {
        variables = await environmentService.listVariables(environmentId)
      }

      // Log audit event
      await auditService.log({
        userId: user.id,
        action: 'list_variables',
        resource: 'environment_variable',
        resourceId: environmentId,
        details: { count: variables.length, pattern, prefix }
      })

      return c.json({
        success: true,
        variables: variables.map(variable => ({
          id: variable.id,
          key: variable.key,
          value: variable.value,
          encrypted: variable.encrypted,
          sensitive: variable.sensitive,
          description: variable.description,
          createdAt: variable.createdAt,
          updatedAt: variable.updatedAt
        }))
      })
      
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      
      console.error('List variables error:', error)
      throw new HTTPException(500, { 
        message: 'Failed to list variables',
        cause: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  // Get a specific variable
  app.get('/environments/:environmentId/variables/:key', async (c) => {
    try {
      const user = getCurrentUser(c)
      if (!user) {
        throw new HTTPException(401, { message: 'Authentication required' })
      }
      
      const environmentId = c.req.param('environmentId')
      const key = c.req.param('key')
      
      if (!environmentId) {
        throw new HTTPException(400, { message: 'Environment ID is required' })
      }
      
      if (!key) {
        throw new HTTPException(400, { message: 'Variable key is required' })
      }

      // Check access
      await checkEnvironmentAccess(user.id, environmentId, 'viewer')

      const variable = await environmentService.getVariable(environmentId, decodeURIComponent(key))
      if (!variable) {
        throw new HTTPException(404, { message: 'Variable not found' })
      }

      // Log audit event
      await auditService.log({
        userId: user.id,
        action: 'get_variable',
        resource: 'environment_variable',
        resourceId: variable.id,
        details: { key: variable.key, environmentId }
      })

      return c.json({
        success: true,
        variable: {
          id: variable.id,
          key: variable.key,
          value: variable.value,
          encrypted: variable.encrypted,
          sensitive: variable.sensitive,
          description: variable.description,
          createdAt: variable.createdAt,
          updatedAt: variable.updatedAt
        }
      })
      
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      
      console.error('Get variable error:', error)
      throw new HTTPException(500, { 
        message: 'Failed to get variable',
        cause: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  // Set/update a variable
  app.put('/environments/:environmentId/variables/:key',
    validator('json', (value) => {
      const { value: varValue, sensitive, description } = value as Record<string, unknown>
      
      if (varValue === undefined || varValue === null) {
        throw new HTTPException(400, { message: 'Variable value is required' })
      }
      
      if (typeof varValue !== 'string') {
        throw new HTTPException(400, { message: 'Variable value must be a string' })
      }
      
      const options: SetVariableOptions = {}
      
      if (sensitive !== undefined) {
        if (typeof sensitive !== 'boolean') {
          throw new HTTPException(400, { message: 'Sensitive flag must be a boolean' })
        }
        options.sensitive = sensitive
      }
      
      if (description !== undefined) {
        if (typeof description !== 'string') {
          throw new HTTPException(400, { message: 'Description must be a string' })
        }
        options.description = description.trim() || undefined
      }
      
      return { value: varValue, options }
    }),
    async (c) => {
      try {
        const user = getCurrentUser(c)
        if (!user) {
          throw new HTTPException(401, { message: 'Authentication required' })
        }
        
        const environmentId = c.req.param('environmentId')
        const key = c.req.param('key')
        
        if (!environmentId) {
          throw new HTTPException(400, { message: 'Environment ID is required' })
        }
        
        if (!key) {
          throw new HTTPException(400, { message: 'Variable key is required' })
        }

        // Check access
        await checkEnvironmentAccess(user.id, environmentId, 'editor')

        const { value, options } = c.req.valid('json')
        const decodedKey = decodeURIComponent(key)
        
        const variable = await environmentService.setVariable(environmentId, decodedKey, value, options)

        // Log audit event
        await auditService.log({
          userId: user.id,
          action: 'set_variable',
          resource: 'environment_variable',
          resourceId: variable.id,
          details: { 
            key: variable.key, 
            environmentId,
            sensitive: variable.sensitive,
            encrypted: variable.encrypted
          }
        })

        return c.json({
          success: true,
          variable: {
            id: variable.id,
            key: variable.key,
            value: variable.value,
            encrypted: variable.encrypted,
            sensitive: variable.sensitive,
            description: variable.description,
            createdAt: variable.createdAt,
            updatedAt: variable.updatedAt
          }
        })
        
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }
        
        console.error('Set variable error:', error)
        throw new HTTPException(500, { 
          message: 'Failed to set variable',
          cause: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  )

  // Delete a variable
  app.delete('/environments/:environmentId/variables/:key', async (c) => {
    try {
      const user = getCurrentUser(c)
      if (!user) {
        throw new HTTPException(401, { message: 'Authentication required' })
      }
      
      const environmentId = c.req.param('environmentId')
      const key = c.req.param('key')
      
      if (!environmentId) {
        throw new HTTPException(400, { message: 'Environment ID is required' })
      }
      
      if (!key) {
        throw new HTTPException(400, { message: 'Variable key is required' })
      }

      // Check access
      await checkEnvironmentAccess(user.id, environmentId, 'editor')

      const decodedKey = decodeURIComponent(key)
      const deleted = await environmentService.deleteVariable(environmentId, decodedKey)
      
      if (!deleted) {
        throw new HTTPException(404, { message: 'Variable not found' })
      }

      // Log audit event
      await auditService.log({
        userId: user.id,
        action: 'delete_variable',
        resource: 'environment_variable',
        resourceId: environmentId,
        details: { key: decodedKey, environmentId }
      })

      return c.json({
        success: true,
        message: 'Variable deleted successfully'
      })
      
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      
      console.error('Delete variable error:', error)
      throw new HTTPException(500, { 
        message: 'Failed to delete variable',
        cause: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  // Batch set variables
  app.post('/environments/:environmentId/variables/batch',
    validator('json', (value) => {
      const { variables, options } = value as Record<string, unknown>
      
      if (!variables || typeof variables !== 'object') {
        throw new HTTPException(400, { message: 'Variables object is required' })
      }
      
      // Validate each variable value is a string
      for (const [key, val] of Object.entries(variables)) {
        if (typeof val !== 'string') {
          throw new HTTPException(400, { message: `Variable value for key "${key}" must be a string` })
        }
      }
      
      const batchOptions: SetVariableOptions = {}
      
      if (options?.sensitive !== undefined) {
        if (typeof options.sensitive !== 'boolean') {
          throw new HTTPException(400, { message: 'Sensitive flag must be a boolean' })
        }
        batchOptions.sensitive = options.sensitive
      }
      
      if (options?.description !== undefined) {
        if (typeof options.description !== 'string') {
          throw new HTTPException(400, { message: 'Description must be a string' })
        }
        batchOptions.description = options.description.trim() || undefined
      }
      
      return { variables, options: batchOptions }
    }),
    async (c) => {
      try {
        const user = getCurrentUser(c)
        if (!user) {
          throw new HTTPException(401, { message: 'Authentication required' })
        }
        
        const environmentId = c.req.param('environmentId')
        
        if (!environmentId) {
          throw new HTTPException(400, { message: 'Environment ID is required' })
        }

        // Check access
        await checkEnvironmentAccess(user.id, environmentId, 'editor')

        const { variables, options } = c.req.valid('json')
        
        const count = await environmentService.setVariables(environmentId, variables, options)

        // Log audit event
        await auditService.log({
          userId: user.id,
          action: 'batch_set_variables',
          resource: 'environment_variable',
          resourceId: environmentId,
          details: { 
            environmentId,
            count,
            keys: Object.keys(variables)
          }
        })

        return c.json({
          success: true,
          message: `Successfully set ${count} variables`,
          count
        })
        
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }
        
        console.error('Batch set variables error:', error)
        throw new HTTPException(500, { 
          message: 'Failed to set variables',
          cause: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  )

  // Delete variables by prefix
  app.delete('/environments/:environmentId/variables/prefix/:prefix', async (c) => {
    try {
      const user = getCurrentUser(c)
      if (!user) {
        throw new HTTPException(401, { message: 'Authentication required' })
      }
      
      const environmentId = c.req.param('environmentId')
      const prefix = c.req.param('prefix')
      
      if (!environmentId) {
        throw new HTTPException(400, { message: 'Environment ID is required' })
      }
      
      if (!prefix) {
        throw new HTTPException(400, { message: 'Prefix is required' })
      }

      // Check access
      await checkEnvironmentAccess(user.id, environmentId, 'editor')

      const decodedPrefix = decodeURIComponent(prefix)
      const count = await environmentService.deleteVariablesByPrefix(environmentId, decodedPrefix)

      // Log audit event
      await auditService.log({
        userId: user.id,
        action: 'delete_variables_by_prefix',
        resource: 'environment_variable',
        resourceId: environmentId,
        details: { prefix: decodedPrefix, environmentId, count }
      })

      return c.json({
        success: true,
        message: `Successfully deleted ${count} variables`,
        count
      })
      
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      
      console.error('Delete variables by prefix error:', error)
      throw new HTTPException(500, { 
        message: 'Failed to delete variables',
        cause: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  // Export variables
  app.get('/environments/:environmentId/export',
    validator('query', (value) => {
      const { format } = value as Record<string, unknown>
      
      const validFormats: ExportFormat[] = ['json', 'dotenv', 'yaml']
      const exportFormat: ExportFormat = format && validFormats.includes(format) ? format : 'json'
      
      return { format: exportFormat }
    }),
    async (c) => {
      try {
        const user = getCurrentUser(c)
        if (!user) {
          throw new HTTPException(401, { message: 'Authentication required' })
        }
        
        const environmentId = c.req.param('environmentId')
        
        if (!environmentId) {
          throw new HTTPException(400, { message: 'Environment ID is required' })
        }

        // Check access
        const environment = await checkEnvironmentAccess(user.id, environmentId, 'viewer')

        const { format } = c.req.valid('query')
        
        const exportData = await environmentService.exportVariables(environmentId, format)

        // Log audit event
        await auditService.log({
          userId: user.id,
          action: 'export_variables',
          resource: 'environment_variable',
          resourceId: environmentId,
          details: { environmentId, format }
        })

        // Set appropriate content type and filename
        const contentTypes = {
          json: 'application/json',
          dotenv: 'text/plain',
          yaml: 'text/yaml'
        }

        const extensions = {
          json: 'json',
          dotenv: 'env',
          yaml: 'yml'
        }

        const filename = `${environment.name}-variables.${extensions[format]}`

        c.header('Content-Type', contentTypes[format])
        c.header('Content-Disposition', `attachment; filename="${filename}"`)

        return c.text(exportData)
        
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }
        
        console.error('Export variables error:', error)
        throw new HTTPException(500, { 
          message: 'Failed to export variables',
          cause: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  )

  // Import variables
  app.post('/environments/:environmentId/import',
    validator('form', (value) => {
      const { format, data } = value as Record<string, unknown>
      
      if (!data || typeof data !== 'string') {
        throw new HTTPException(400, { message: 'Import data is required' })
      }
      
      const validFormats: ImportFormat[] = ['json', 'dotenv', 'yaml']
      if (!format || !validFormats.includes(format)) {
        throw new HTTPException(400, { message: 'Valid format is required (json, dotenv, yaml)' })
      }
      
      return { format: format as ImportFormat, data }
    }),
    async (c) => {
      try {
        const user = getCurrentUser(c)
        if (!user) {
          throw new HTTPException(401, { message: 'Authentication required' })
        }
        
        const environmentId = c.req.param('environmentId')
        
        if (!environmentId) {
          throw new HTTPException(400, { message: 'Environment ID is required' })
        }

        // Check access
        await checkEnvironmentAccess(user.id, environmentId, 'editor')

        const { format, data } = c.req.valid('form')
        
        const result = await environmentService.importVariables(environmentId, data, format)

        // Log audit event
        await auditService.log({
          userId: user.id,
          action: 'import_variables',
          resource: 'environment_variable',
          resourceId: environmentId,
          details: { 
            environmentId, 
            format,
            imported: result.imported,
            skipped: result.skipped,
            errors: result.errors.length
          }
        })

        return c.json({
          success: true,
          result: {
            imported: result.imported,
            skipped: result.skipped,
            errors: result.errors
          }
        })
        
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }
        
        console.error('Import variables error:', error)
        throw new HTTPException(500, { 
          message: 'Failed to import variables',
          cause: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  )

  // Copy variables between environments
  app.post('/environments/:environmentId/copy',
    validator('json', (value) => {
      const { targetEnvironmentId, overwrite } = value as Record<string, unknown>
      
      if (!targetEnvironmentId || typeof targetEnvironmentId !== 'string') {
        throw new HTTPException(400, { message: 'Target environment ID is required' })
      }
      
      const shouldOverwrite = overwrite === true
      
      return { targetEnvironmentId, overwrite: shouldOverwrite }
    }),
    async (c) => {
      try {
        const user = getCurrentUser(c)
        if (!user) {
          throw new HTTPException(401, { message: 'Authentication required' })
        }
        
        const sourceEnvironmentId = c.req.param('environmentId')
        
        if (!sourceEnvironmentId) {
          throw new HTTPException(400, { message: 'Source environment ID is required' })
        }

        const { targetEnvironmentId, overwrite } = c.req.valid('json')

        // Check access to both environments
        await checkEnvironmentAccess(user.id, sourceEnvironmentId, 'viewer')
        await checkEnvironmentAccess(user.id, targetEnvironmentId, 'editor')

        const count = await environmentService.copyVariables(sourceEnvironmentId, targetEnvironmentId, overwrite)

        // Log audit event
        await auditService.log({
          userId: user.id,
          action: 'copy_variables',
          resource: 'environment_variable',
          resourceId: sourceEnvironmentId,
          details: { 
            sourceEnvironmentId,
            targetEnvironmentId,
            overwrite,
            count
          }
        })

        return c.json({
          success: true,
          message: `Successfully copied ${count} variables`,
          count
        })
        
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }
        
        console.error('Copy variables error:', error)
        throw new HTTPException(500, { 
          message: 'Failed to copy variables',
          cause: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  )

  // Client API - Get environment variables (API key authentication)
  app.get('/client/:environmentId', apiKeyMiddleware, async (c) => {
    try {
      const user = getCurrentUser(c)
      if (!user) {
        throw new HTTPException(401, { message: 'API key authentication required' })
      }
      
      const environmentId = c.req.param('environmentId')
      
      if (!environmentId) {
        throw new HTTPException(400, { message: 'Environment ID is required' })
      }

      // Check access
      await checkEnvironmentAccess(user.id, environmentId, 'viewer')

      const variables = await environmentService.listVariables(environmentId)

      // Convert to key-value object for client consumption
      const variablesObj = variables.reduce<Record<string, string>>((acc, variable) => {
        acc[variable.key] = variable.value
        return acc
      }, {})

      // Log audit event (without logging sensitive values)
      await auditService.log({
        userId: user.id,
        action: 'client_get_variables',
        resource: 'environment_variable',
        resourceId: environmentId,
        details: { 
          environmentId,
          count: variables.length,
          clientAccess: true
        }
      })

      return c.json({
        success: true,
        variables: variablesObj
      })
      
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      
      console.error('Client get variables error:', error)
      throw new HTTPException(500, { 
        message: 'Failed to get variables',
        cause: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  return app
}