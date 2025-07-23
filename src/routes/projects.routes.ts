import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { validator } from 'hono/validator'
import { ProjectService, CreateProjectData, UpdateProjectData, CreateEnvironmentData, ProjectRole } from '../services/project.service'
import { DatabaseManager } from '../db/manager'
import { 
  createAuthMiddleware, 
  getCurrentUser,
  isAdmin,

} from '../middleware/auth.middleware'
import { UserService } from '../services/user.service'
import { CryptoService } from '../services/crypto.service'
import { errorHandler } from '../middleware/error.middleware'

/**
 * Project management routes
 * Handles project CRUD operations, environment management, and project permissions
 */
export function createProjectRoutes(
  dbManager: DatabaseManager,
  cryptoService: CryptoService,
  jwtSecret: string
): Hono {
  const app = new Hono()
  const projectService = new ProjectService(dbManager)
  const userService = new UserService(dbManager, cryptoService)
  
  // Set up error handler
  app.onError(errorHandler)
  
  // Create auth middleware
  const authMiddleware = createAuthMiddleware({
    jwtSecret,
    userService
  })

  // Apply authentication to all routes
  app.use('*', authMiddleware)

  // Create a new project
  app.post('/',
    validator('json', (value, _c) => {
      const { name, description } = value as any
      
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw new HTTPException(400, { message: 'Project name is required' })
      }
      
      if (description && typeof description !== 'string') {
        throw new HTTPException(400, { message: 'Description must be a string' })
      }
      
      return {
        name: name.trim(),
        description: description?.trim() || undefined
      }
    }),
    async (c) => {
      try {
        const user = getCurrentUser(c)
        if (!user) {
          throw new HTTPException(401, { message: 'Authentication required' })
        }
        
        const { name, description } = c.req.valid('json')
        
        const projectData: CreateProjectData = {
          name,
          description,
          ownerId: user.id
        }
        
        const project = await projectService.createProject(projectData)
        
        return c.json({
          success: true,
          project: {
            id: project.id,
            name: project.name,
            description: project.description,
            ownerId: project.ownerId,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt
          }
        }, 201)
        
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }
        
        console.error('Create project error:', error)
        throw new HTTPException(500, { 
          message: 'Failed to create project',
          cause: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  )

  // List user's projects
  app.get('/', async (c) => {
    try {
      const user = getCurrentUser(c)
      if (!user) {
        throw new HTTPException(401, { message: 'Authentication required' })
      }
      
      const projects = await projectService.listProjects(user.id)
      
      return c.json({
        success: true,
        projects: projects.map(project => ({
          id: project.id,
          name: project.name,
          description: project.description,
          ownerId: project.ownerId,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt
        }))
      })
      
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      
      console.error('List projects error:', error)
      throw new HTTPException(500, { 
        message: 'Failed to list projects',
        cause: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  // Get a specific project
  app.get('/:projectId', async (c) => {
    try {
      const user = getCurrentUser(c)
      if (!user) {
        throw new HTTPException(401, { message: 'Authentication required' })
      }
      
      const projectId = c.req.param('projectId')
      if (!projectId) {
        throw new HTTPException(400, { message: 'Project ID is required' })
      }
      
      const project = await projectService.getProject(projectId)
      if (!project) {
        throw new HTTPException(404, { message: 'Project not found' })
      }
      
      // Check if user has permission to view this project
      const hasPermission = await projectService.checkPermission(user.id, projectId, 'viewer')
      if (!hasPermission) {
        throw new HTTPException(403, { message: 'Access denied to this project' })
      }
      
      return c.json({
        success: true,
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          ownerId: project.ownerId,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt
        }
      })
      
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      
      console.error('Get project error:', error)
      throw new HTTPException(500, { 
        message: 'Failed to get project',
        cause: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  // Update a project
  app.put('/:projectId',
    validator('json', (value, _c) => {
      const { name, description } = value as any
      
      const updateData: UpdateProjectData = {}
      
      if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length === 0) {
          throw new HTTPException(400, { message: 'Project name cannot be empty' })
        }
        updateData.name = name.trim()
      }
      
      if (description !== undefined) {
        if (typeof description !== 'string') {
          throw new HTTPException(400, { message: 'Description must be a string' })
        }
        updateData.description = description.trim() || undefined
      }
      
      return updateData
    }),
    async (c) => {
      try {
        const user = getCurrentUser(c)
        if (!user) {
          throw new HTTPException(401, { message: 'Authentication required' })
        }
        
        const projectId = c.req.param('projectId')
        if (!projectId) {
          throw new HTTPException(400, { message: 'Project ID is required' })
        }
        
        // Check if user has permission to edit this project
        const hasPermission = await projectService.checkPermission(user.id, projectId, 'admin')
        if (!hasPermission) {
          throw new HTTPException(403, { message: 'Insufficient permissions to edit this project' })
        }
        
        const updateData = c.req.valid('json')
        
        const project = await projectService.updateProject(projectId, updateData)
        
        return c.json({
          success: true,
          project: {
            id: project.id,
            name: project.name,
            description: project.description,
            ownerId: project.ownerId,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt
          }
        })
        
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }
        
        console.error('Update project error:', error)
        throw new HTTPException(500, { 
          message: 'Failed to update project',
          cause: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  )

  // Delete a project
  app.delete('/:projectId', async (c) => {
    try {
      const user = getCurrentUser(c)
      if (!user) {
        throw new HTTPException(401, { message: 'Authentication required' })
      }
      
      const projectId = c.req.param('projectId')
      if (!projectId) {
        throw new HTTPException(400, { message: 'Project ID is required' })
      }
      
      // Check if user is the owner or admin
      const isProjectOwner = await projectService.isProjectOwner(user.id, projectId)
      const userIsAdmin = isAdmin(c)
      
      if (!isProjectOwner && !userIsAdmin) {
        throw new HTTPException(403, { message: 'Only project owners or system admins can delete projects' })
      }
      
      await projectService.deleteProject(projectId)
      
      return c.json({
        success: true,
        message: 'Project deleted successfully'
      })
      
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      
      console.error('Delete project error:', error)
      throw new HTTPException(500, { 
        message: 'Failed to delete project',
        cause: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  // Environment management routes

  // Create a new environment for a project
  app.post('/:projectId/environments',
    validator('json', (value, _c) => {
      const { name } = value as any
      
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw new HTTPException(400, { message: 'Environment name is required' })
      }
      
      return { name: name.trim() } as CreateEnvironmentData
    }),
    async (c) => {
      try {
        const user = getCurrentUser(c)
        if (!user) {
          throw new HTTPException(401, { message: 'Authentication required' })
        }
        
        const projectId = c.req.param('projectId')
        if (!projectId) {
          throw new HTTPException(400, { message: 'Project ID is required' })
        }
        
        // Check if user has permission to edit this project
        const hasPermission = await projectService.checkPermission(user.id, projectId, 'editor')
        if (!hasPermission) {
          throw new HTTPException(403, { message: 'Insufficient permissions to create environments' })
        }
        
        const { name } = c.req.valid('json')
        
        const environment = await projectService.createEnvironment(projectId, { name })
        
        return c.json({
          success: true,
          environment: {
            id: environment.id,
            name: environment.name,
            projectId: environment.projectId,
            createdAt: environment.createdAt,
            updatedAt: environment.updatedAt
          }
        }, 201)
        
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }
        
        console.error('Create environment error:', error)
        throw new HTTPException(500, { 
          message: 'Failed to create environment',
          cause: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  )

  // List environments for a project
  app.get('/:projectId/environments', async (c) => {
    try {
      const user = getCurrentUser(c)
      if (!user) {
        throw new HTTPException(401, { message: 'Authentication required' })
      }
      
      const projectId = c.req.param('projectId')
      if (!projectId) {
        throw new HTTPException(400, { message: 'Project ID is required' })
      }
      
      // Check if user has permission to view this project
      const hasPermission = await projectService.checkPermission(user.id, projectId, 'viewer')
      if (!hasPermission) {
        throw new HTTPException(403, { message: 'Access denied to this project' })
      }
      
      const environments = await projectService.listEnvironments(projectId)
      
      return c.json({
        success: true,
        environments: environments.map(env => ({
          id: env.id,
          name: env.name,
          projectId: env.projectId,
          createdAt: env.createdAt,
          updatedAt: env.updatedAt
        }))
      })
      
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      
      console.error('List environments error:', error)
      throw new HTTPException(500, { 
        message: 'Failed to list environments',
        cause: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  // Get a specific environment
  app.get('/:projectId/environments/:environmentId', async (c) => {
    try {
      const user = getCurrentUser(c)
      if (!user) {
        throw new HTTPException(401, { message: 'Authentication required' })
      }
      
      const projectId = c.req.param('projectId')
      const environmentId = c.req.param('environmentId')
      
      if (!projectId) {
        throw new HTTPException(400, { message: 'Project ID is required' })
      }
      
      if (!environmentId) {
        throw new HTTPException(400, { message: 'Environment ID is required' })
      }
      
      // Check if user has permission to view this project
      const hasPermission = await projectService.checkPermission(user.id, projectId, 'viewer')
      if (!hasPermission) {
        throw new HTTPException(403, { message: 'Access denied to this project' })
      }
      
      const environment = await projectService.getEnvironment(environmentId)
      if (!environment) {
        throw new HTTPException(404, { message: 'Environment not found' })
      }
      
      // Verify the environment belongs to the project
      if (environment.projectId !== projectId) {
        throw new HTTPException(404, { message: 'Environment not found in this project' })
      }
      
      return c.json({
        success: true,
        environment: {
          id: environment.id,
          name: environment.name,
          projectId: environment.projectId,
          createdAt: environment.createdAt,
          updatedAt: environment.updatedAt
        }
      })
      
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      
      console.error('Get environment error:', error)
      throw new HTTPException(500, { 
        message: 'Failed to get environment',
        cause: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  // Delete an environment
  app.delete('/:projectId/environments/:environmentId', async (c) => {
    try {
      const user = getCurrentUser(c)
      if (!user) {
        throw new HTTPException(401, { message: 'Authentication required' })
      }
      
      const projectId = c.req.param('projectId')
      const environmentId = c.req.param('environmentId')
      
      if (!projectId) {
        throw new HTTPException(400, { message: 'Project ID is required' })
      }
      
      if (!environmentId) {
        throw new HTTPException(400, { message: 'Environment ID is required' })
      }
      
      // Check if user has permission to edit this project
      const hasPermission = await projectService.checkPermission(user.id, projectId, 'editor')
      if (!hasPermission) {
        throw new HTTPException(403, { message: 'Insufficient permissions to delete environments' })
      }
      
      // Verify the environment belongs to the project
      const environment = await projectService.getEnvironment(environmentId)
      if (!environment || environment.projectId !== projectId) {
        throw new HTTPException(404, { message: 'Environment not found in this project' })
      }
      
      await projectService.deleteEnvironment(environmentId)
      
      return c.json({
        success: true,
        message: 'Environment deleted successfully'
      })
      
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      
      console.error('Delete environment error:', error)
      throw new HTTPException(500, { 
        message: 'Failed to delete environment',
        cause: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  // Project permissions management routes

  // List project permissions
  app.get('/:projectId/permissions', async (c) => {
    try {
      const user = getCurrentUser(c)
      if (!user) {
        throw new HTTPException(401, { message: 'Authentication required' })
      }
      
      const projectId = c.req.param('projectId')
      if (!projectId) {
        throw new HTTPException(400, { message: 'Project ID is required' })
      }
      
      // Check if user has admin permission to view permissions
      const hasPermission = await projectService.checkPermission(user.id, projectId, 'admin')
      if (!hasPermission) {
        throw new HTTPException(403, { message: 'Insufficient permissions to view project permissions' })
      }
      
      const permissions = await projectService.listProjectPermissions(projectId)
      
      return c.json({
        success: true,
        permissions: permissions.map(permission => ({
          id: permission.id,
          userId: permission.userId,
          projectId: permission.projectId,
          role: permission.role,
          createdAt: permission.createdAt
        }))
      })
      
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      
      console.error('List permissions error:', error)
      throw new HTTPException(500, { 
        message: 'Failed to list project permissions',
        cause: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  // Grant permission to a user
  app.post('/:projectId/permissions',
    validator('json', (value, _c) => {
      const { userId, role } = value as any
      
      if (!userId || typeof userId !== 'string') {
        throw new HTTPException(400, { message: 'User ID is required' })
      }
      
      if (!role || !['owner', 'admin', 'editor', 'viewer'].includes(role)) {
        throw new HTTPException(400, { message: 'Valid role is required (owner, admin, editor, viewer)' })
      }
      
      return { userId, role: role as ProjectRole }
    }),
    async (c) => {
      try {
        const user = getCurrentUser(c)
        if (!user) {
          throw new HTTPException(401, { message: 'Authentication required' })
        }
        
        const projectId = c.req.param('projectId')
        if (!projectId) {
          throw new HTTPException(400, { message: 'Project ID is required' })
        }
        
        // Check if user has admin permission to grant permissions
        const hasPermission = await projectService.checkPermission(user.id, projectId, 'admin')
        if (!hasPermission) {
          throw new HTTPException(403, { message: 'Insufficient permissions to grant project permissions' })
        }
        
        const { userId, role } = c.req.valid('json')
        
        // Check if the target user exists
        const targetUser = await userService.getUserById(userId)
        if (!targetUser) {
          throw new HTTPException(404, { message: 'User not found' })
        }
        
        const permission = await projectService.grantPermission(userId, projectId, role)
        
        return c.json({
          success: true,
          permission: {
            id: permission.id,
            userId: permission.userId,
            projectId: permission.projectId,
            role: permission.role,
            createdAt: permission.createdAt
          }
        }, 201)
        
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }
        
        console.error('Grant permission error:', error)
        throw new HTTPException(500, { 
          message: 'Failed to grant permission',
          cause: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  )

  // Revoke permission from a user
  app.delete('/:projectId/permissions/:userId', async (c) => {
    try {
      const user = getCurrentUser(c)
      if (!user) {
        throw new HTTPException(401, { message: 'Authentication required' })
      }
      
      const projectId = c.req.param('projectId')
      const targetUserId = c.req.param('userId')
      
      if (!projectId) {
        throw new HTTPException(400, { message: 'Project ID is required' })
      }
      
      if (!targetUserId) {
        throw new HTTPException(400, { message: 'User ID is required' })
      }
      
      // Check if user has admin permission to revoke permissions
      const hasPermission = await projectService.checkPermission(user.id, projectId, 'admin')
      if (!hasPermission) {
        throw new HTTPException(403, { message: 'Insufficient permissions to revoke project permissions' })
      }
      
      const success = await projectService.revokePermission(targetUserId, projectId)
      if (!success) {
        throw new HTTPException(404, { message: 'Permission not found or cannot be revoked' })
      }
      
      return c.json({
        success: true,
        message: 'Permission revoked successfully'
      })
      
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      
      console.error('Revoke permission error:', error)
      throw new HTTPException(500, { 
        message: 'Failed to revoke permission',
        cause: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  // Transfer project ownership
  app.post('/:projectId/transfer-ownership',
    validator('json', (value, _c) => {
      const { newOwnerId } = value as unknown
      
      if (!newOwnerId || typeof newOwnerId !== 'string') {
        throw new HTTPException(400, { message: 'New owner ID is required' })
      }
      
      return { newOwnerId }
    }),
    async (c) => {
      try {
        const user = getCurrentUser(c)
        if (!user) {
          throw new HTTPException(401, { message: 'Authentication required' })
        }
        
        const projectId = c.req.param('projectId')
        if (!projectId) {
          throw new HTTPException(400, { message: 'Project ID is required' })
        }
        
        // Check if user is the current owner
        const isProjectOwner = await projectService.isProjectOwner(user.id, projectId)
        if (!isProjectOwner) {
          throw new HTTPException(403, { message: 'Only project owners can transfer ownership' })
        }
        
        const { newOwnerId } = c.req.valid('json')
        
        // Check if the new owner exists
        const newOwner = await userService.getUserById(newOwnerId)
        if (!newOwner) {
          throw new HTTPException(404, { message: 'New owner not found' })
        }
        
        await projectService.transferOwnership(projectId, newOwnerId)
        
        return c.json({
          success: true,
          message: 'Project ownership transferred successfully'
        })
        
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }
        
        console.error('Transfer ownership error:', error)
        throw new HTTPException(500, { 
          message: 'Failed to transfer ownership',
          cause: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  )

  return app
}