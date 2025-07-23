import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { validator } from 'hono/validator'
import { AuditService } from '../services/audit.service'
import { DatabaseManager } from '../db/manager'
import { 
  createAuthMiddleware, 
  getCurrentUser,
  isAdmin
} from '../middleware/auth.middleware'
import { UserService } from '../services/user.service'
import { CryptoService } from '../services/crypto.service'
import { errorHandler } from '../middleware/error.middleware'
import { AuditFilters } from '../types/audit'

/**
 * Audit log routes
 * Handles audit log querying, filtering, and statistics
 */
export function createAuditRoutes(
  dbManager: DatabaseManager,
  cryptoService: CryptoService,
  jwtSecret: string
): Hono {
  const app = new Hono()
  const auditService = new AuditService(dbManager)
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

  // Get audit logs with filtering and pagination
  app.get('/logs',
    validator('query', (value, _c) => {
      const {
        userId,
        action,
        resource,
        startDate,
        endDate,
        page,
        pageSize
      } = value as Record<string, unknown>

      const filters: AuditFilters = {}

      if (userId && typeof userId === 'string') {
        filters.userId = userId
      }

      if (action && typeof action === 'string') {
        filters.action = action
      }

      if (resource && typeof resource === 'string') {
        filters.resource = resource
      }

      if (startDate && typeof startDate === 'string') {
        const parsedStartDate = new Date(startDate)
        if (isNaN(parsedStartDate.getTime())) {
          throw new HTTPException(400, { message: 'Invalid start date format' })
        }
        filters.startDate = parsedStartDate
      }

      if (endDate && typeof endDate === 'string') {
        const parsedEndDate = new Date(endDate)
        if (isNaN(parsedEndDate.getTime())) {
          throw new HTTPException(400, { message: 'Invalid end date format' })
        }
        filters.endDate = parsedEndDate
      }

      if (page && typeof page === 'string') {
        const parsedPage = parseInt(page, 10)
        if (isNaN(parsedPage) || parsedPage < 1) {
          throw new HTTPException(400, { message: 'Page must be a positive integer' })
        }
        filters.page = parsedPage
      }

      if (pageSize && typeof pageSize === 'string') {
        const parsedPageSize = parseInt(pageSize, 10)
        if (isNaN(parsedPageSize) || parsedPageSize < 1 || parsedPageSize > 100) {
          throw new HTTPException(400, { message: 'Page size must be between 1 and 100' })
        }
        filters.pageSize = parsedPageSize
      }

      return filters
    }),
    async (c) => {
      try {
        const user = getCurrentUser(c)
        if (!user) {
          throw new HTTPException(401, { message: 'Authentication required' })
        }

        // Only admins can view all audit logs
        // Regular users can only view their own logs
        const userIsAdmin = isAdmin(c)
        const filters = c.req.valid('query')

        if (!userIsAdmin) {
          // Non-admin users can only see their own logs
          filters.userId = user.id
        }

        const result = await auditService.getLogs(filters)

        return c.json({
          success: true,
          logs: result.data.map(log => ({
            id: log.id,
            userId: log.userId,
            action: log.action,
            resource: log.resource,
            resourceId: log.resourceId,
            details: log.details,
            ipAddress: log.ipAddress,
            userAgent: log.userAgent,
            timestamp: log.timestamp
          })),
          pagination: {
            total: result.total,
            page: result.page,
            pageSize: result.pageSize,
            totalPages: result.totalPages,
            hasMore: result.hasMore
          }
        })

      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }

        console.error('Get audit logs error:', error)
        throw new HTTPException(500, { 
          message: 'Failed to get audit logs',
          cause: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  )

  // Get audit logs for a specific resource
  app.get('/logs/resource/:resource/:resourceId', async (c) => {
    try {
      const user = getCurrentUser(c)
      if (!user) {
        throw new HTTPException(401, { message: 'Authentication required' })
      }

      const resource = c.req.param('resource')
      const resourceId = c.req.param('resourceId')

      if (!resource) {
        throw new HTTPException(400, { message: 'Resource type is required' })
      }

      if (!resourceId) {
        throw new HTTPException(400, { message: 'Resource ID is required' })
      }

      // Get limit from query parameter
      const limitParam = c.req.query('limit')
      const limit = limitParam ? parseInt(limitParam, 10) : undefined

      if (limit && (isNaN(limit) || limit < 1 || limit > 100)) {
        throw new HTTPException(400, { message: 'Limit must be between 1 and 100' })
      }

      // Only admins can view all resource logs
      // Regular users need to have access to the specific resource
      const userIsAdmin = isAdmin(c)
      
      if (!userIsAdmin) {
        // For non-admin users, we should check if they have access to the resource
        // This would typically involve checking project permissions, but for now
        // we'll restrict to admin-only access for resource logs
        throw new HTTPException(403, { message: 'Admin access required to view resource audit logs' })
      }

      const logs = await auditService.getResourceLogs(resource, resourceId, limit)

      return c.json({
        success: true,
        logs: logs.map(log => ({
          id: log.id,
          userId: log.userId,
          action: log.action,
          resource: log.resource,
          resourceId: log.resourceId,
          details: log.details,
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          timestamp: log.timestamp
        }))
      })

    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }

      console.error('Get resource audit logs error:', error)
      throw new HTTPException(500, { 
        message: 'Failed to get resource audit logs',
        cause: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  // Get audit logs for a specific user (admin only)
  app.get('/logs/user/:userId', async (c) => {
    try {
      const user = getCurrentUser(c)
      if (!user) {
        throw new HTTPException(401, { message: 'Authentication required' })
      }

      const targetUserId = c.req.param('userId')
      if (!targetUserId) {
        throw new HTTPException(400, { message: 'User ID is required' })
      }

      // Only admins can view other users' logs
      // Users can view their own logs via the general logs endpoint
      const userIsAdmin = isAdmin(c)
      if (!userIsAdmin && user.id !== targetUserId) {
        throw new HTTPException(403, { message: 'Admin access required to view other users\' audit logs' })
      }

      // Get limit from query parameter
      const limitParam = c.req.query('limit')
      const limit = limitParam ? parseInt(limitParam, 10) : undefined

      if (limit && (isNaN(limit) || limit < 1 || limit > 100)) {
        throw new HTTPException(400, { message: 'Limit must be between 1 and 100' })
      }

      const logs = await auditService.getUserLogs(targetUserId, limit)

      return c.json({
        success: true,
        logs: logs.map(log => ({
          id: log.id,
          userId: log.userId,
          action: log.action,
          resource: log.resource,
          resourceId: log.resourceId,
          details: log.details,
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          timestamp: log.timestamp
        }))
      })

    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }

      console.error('Get user audit logs error:', error)
      throw new HTTPException(500, { 
        message: 'Failed to get user audit logs',
        cause: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  // Search audit logs (admin only)
  app.get('/logs/search',
    validator('query', (value, _c) => {
      const { q, userId, action, resource, startDate, endDate, page, pageSize } = value as Record<string, unknown>

      if (!q || typeof q !== 'string' || q.trim().length === 0) {
        throw new HTTPException(400, { message: 'Search query is required' })
      }

      const filters: AuditFilters = {}

      if (userId && typeof userId === 'string') {
        filters.userId = userId
      }

      if (action && typeof action === 'string') {
        filters.action = action
      }

      if (resource && typeof resource === 'string') {
        filters.resource = resource
      }

      if (startDate && typeof startDate === 'string') {
        const parsedStartDate = new Date(startDate)
        if (isNaN(parsedStartDate.getTime())) {
          throw new HTTPException(400, { message: 'Invalid start date format' })
        }
        filters.startDate = parsedStartDate
      }

      if (endDate && typeof endDate === 'string') {
        const parsedEndDate = new Date(endDate)
        if (isNaN(parsedEndDate.getTime())) {
          throw new HTTPException(400, { message: 'Invalid end date format' })
        }
        filters.endDate = parsedEndDate
      }

      if (page && typeof page === 'string') {
        const parsedPage = parseInt(page, 10)
        if (isNaN(parsedPage) || parsedPage < 1) {
          throw new HTTPException(400, { message: 'Page must be a positive integer' })
        }
        filters.page = parsedPage
      }

      if (pageSize && typeof pageSize === 'string') {
        const parsedPageSize = parseInt(pageSize, 10)
        if (isNaN(parsedPageSize) || parsedPageSize < 1 || parsedPageSize > 100) {
          throw new HTTPException(400, { message: 'Page size must be between 1 and 100' })
        }
        filters.pageSize = parsedPageSize
      }

      return { query: q.trim(), filters }
    }),
    async (c) => {
      try {
        const user = getCurrentUser(c)
        if (!user) {
          throw new HTTPException(401, { message: 'Authentication required' })
        }

        // Only admins can search audit logs
        const userIsAdmin = isAdmin(c)
        if (!userIsAdmin) {
          throw new HTTPException(403, { message: 'Admin access required to search audit logs' })
        }

        const { query, filters } = c.req.valid('query')

        const result = await auditService.searchLogs(query, filters)

        return c.json({
          success: true,
          logs: result.data.map(log => ({
            id: log.id,
            userId: log.userId,
            action: log.action,
            resource: log.resource,
            resourceId: log.resourceId,
            details: log.details,
            ipAddress: log.ipAddress,
            userAgent: log.userAgent,
            timestamp: log.timestamp
          })),
          pagination: {
            total: result.total,
            page: result.page,
            pageSize: result.pageSize,
            totalPages: result.totalPages,
            hasMore: result.hasMore
          }
        })

      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }

        console.error('Search audit logs error:', error)
        throw new HTTPException(500, { 
          message: 'Failed to search audit logs',
          cause: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  )

  // Get audit statistics (admin only)
  app.get('/statistics', async (c) => {
    try {
      const user = getCurrentUser(c)
      if (!user) {
        throw new HTTPException(401, { message: 'Authentication required' })
      }

      // Only admins can view audit statistics
      const userIsAdmin = isAdmin(c)
      if (!userIsAdmin) {
        throw new HTTPException(403, { message: 'Admin access required to view audit statistics' })
      }

      // Get days parameter from query
      const daysParam = c.req.query('days')
      const days = daysParam ? parseInt(daysParam, 10) : 30

      if (isNaN(days) || days < 1 || days > 365) {
        throw new HTTPException(400, { message: 'Days must be between 1 and 365' })
      }

      const statistics = await auditService.getStatistics(days)

      return c.json({
        success: true,
        statistics: {
          totalLogs: statistics.totalLogs,
          actionCounts: statistics.actionCounts,
          resourceCounts: statistics.resourceCounts,
          userCounts: statistics.userCounts,
          dailyActivity: statistics.dailyActivity
        }
      })

    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }

      console.error('Get audit statistics error:', error)
      throw new HTTPException(500, { 
        message: 'Failed to get audit statistics',
        cause: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  // Get recent activity
  app.get('/recent', async (c) => {
    try {
      const user = getCurrentUser(c)
      if (!user) {
        throw new HTTPException(401, { message: 'Authentication required' })
      }

      // Get limit from query parameter
      const limitParam = c.req.query('limit')
      const limit = limitParam ? parseInt(limitParam, 10) : 10

      if (isNaN(limit) || limit < 1 || limit > 50) {
        throw new HTTPException(400, { message: 'Limit must be between 1 and 50' })
      }

      // Only admins can view all recent activity
      // Regular users can only view their own recent activity
      const userIsAdmin = isAdmin(c)
      
      let logs
      if (userIsAdmin) {
        logs = await auditService.getRecentActivity(limit)
      } else {
        logs = await auditService.getUserLogs(user.id, limit)
      }

      return c.json({
        success: true,
        logs: logs.map(log => ({
          id: log.id,
          userId: log.userId,
          action: log.action,
          resource: log.resource,
          resourceId: log.resourceId,
          details: log.details,
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          timestamp: log.timestamp
        }))
      })

    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }

      console.error('Get recent activity error:', error)
      throw new HTTPException(500, { 
        message: 'Failed to get recent activity',
        cause: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  // Clean up old audit logs (admin only)
  app.post('/cleanup',
    validator('json', (value, _c) => {
      const { retentionDays } = value as Record<string, unknown>

      if (retentionDays !== undefined) {
        if (typeof retentionDays !== 'number' || retentionDays < 1 || retentionDays > 3650) {
          throw new HTTPException(400, { message: 'Retention days must be between 1 and 3650' })
        }
      }

      return { retentionDays }
    }),
    async (c) => {
      try {
        const user = getCurrentUser(c)
        if (!user) {
          throw new HTTPException(401, { message: 'Authentication required' })
        }

        // Only admins can clean up audit logs
        const userIsAdmin = isAdmin(c)
        if (!userIsAdmin) {
          throw new HTTPException(403, { message: 'Admin access required to clean up audit logs' })
        }

        const { retentionDays } = c.req.valid('json')

        const deletedCount = await auditService.cleanup(retentionDays)

        return c.json({
          success: true,
          message: `Successfully cleaned up ${deletedCount} old audit logs`,
          deletedCount
        })

      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }

        console.error('Cleanup audit logs error:', error)
        throw new HTTPException(500, { 
          message: 'Failed to clean up audit logs',
          cause: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  )

  return app
}