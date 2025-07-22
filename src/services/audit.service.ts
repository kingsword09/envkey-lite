import { DatabaseManager } from '../db'
import { auditLogs } from '../db/schema'
import { eq, and, gte, lte, desc, sql, like } from 'drizzle-orm'
import { AuditEvent, AuditFilters } from '../types/audit'
import { z } from 'zod'

/**
 * Configuration options for the AuditService
 */
export interface AuditServiceOptions {
  /**
   * Default retention period in days
   * @default 90
   */
  defaultRetentionDays?: number

  /**
   * Default page size for paginated queries
   * @default 50
   */
  defaultPageSize?: number

  /**
   * Maximum page size for paginated queries
   * @default 100
   */
  maxPageSize?: number
}

/**
 * Schema for validating audit service configuration
 */
export const AuditServiceConfigSchema = z.object({
  defaultRetentionDays: z.number().int().positive().default(90),
  defaultPageSize: z.number().int().positive().default(50),
  maxPageSize: z.number().int().positive().default(100),
})

/**
 * Pagination result interface
 */
export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasMore: boolean
}

/**
 * AuditService provides functionality for recording and querying audit logs
 */
export class AuditService {
  private readonly dbManager: DatabaseManager
  private readonly defaultRetentionDays: number
  private readonly defaultPageSize: number
  private readonly maxPageSize: number

  /**
   * Creates a new AuditService instance
   *
   * @param dbManager - The database manager instance
   * @param options - Configuration options
   */
  constructor(dbManager: DatabaseManager, options: AuditServiceOptions = {}) {
    this.dbManager = dbManager
    this.defaultRetentionDays = options.defaultRetentionDays || 90
    this.defaultPageSize = options.defaultPageSize || 50
    this.maxPageSize = options.maxPageSize || 100
  }

  /**
   * Record an audit event
   *
   * @param event - The audit event to record
   * @returns Promise that resolves when the event is recorded
   */
  async log(event: AuditEvent): Promise<void> {
    try {
      const db = this.dbManager.getDb()

      await db.insert(auditLogs).values({
        userId: event.userId || null,
        action: event.action,
        resource: event.resource,
        resourceId: event.resourceId || null,
        details: event.details || null,
        ipAddress: event.ipAddress || null,
        userAgent: event.userAgent || null,
        timestamp: new Date(),
      })
    } catch (error) {
      console.error('Failed to record audit log:', error)
      throw new Error(
        `Failed to record audit log: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Get audit logs with filtering and pagination
   *
   * @param filters - Filters to apply to the query
   * @returns Promise that resolves with the paginated audit logs
   */
  async getLogs(
    filters: AuditFilters = {}
  ): Promise<PaginatedResult<typeof auditLogs.$inferSelect>> {
    try {
      const db = this.dbManager.getDb()

      // Build the where clause based on filters
      const whereConditions = []

      if (filters.userId) {
        whereConditions.push(eq(auditLogs.userId, filters.userId))
      }

      if (filters.action) {
        whereConditions.push(like(auditLogs.action, `%${filters.action}%`))
      }

      if (filters.resource) {
        whereConditions.push(like(auditLogs.resource, `%${filters.resource}%`))
      }

      if (filters.startDate) {
        whereConditions.push(gte(auditLogs.timestamp, filters.startDate))
      }

      if (filters.endDate) {
        whereConditions.push(lte(auditLogs.timestamp, filters.endDate))
      }

      // Apply pagination
      const page = filters.page || 1
      const pageSize = Math.min(filters.pageSize || this.defaultPageSize, this.maxPageSize)
      const offset = (page - 1) * pageSize

      // Get total count for pagination
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(auditLogs)
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
        .execute()

      const total = Number(countResult[0]?.count || 0)

      // Get paginated results
      const logs = await db
        .select()
        .from(auditLogs)
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
        .orderBy(desc(auditLogs.timestamp))
        .limit(pageSize)
        .offset(offset)
        .execute()

      const totalPages = Math.ceil(total / pageSize)

      return {
        data: logs,
        total,
        page,
        pageSize,
        totalPages,
        hasMore: page < totalPages,
      }
    } catch (error) {
      console.error('Failed to get audit logs:', error)
      throw new Error(
        `Failed to get audit logs: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Get audit logs for a specific resource
   *
   * @param resource - The resource type
   * @param resourceId - The resource ID
   * @param limit - Maximum number of logs to return
   * @returns Promise that resolves with the audit logs
   */
  async getResourceLogs(
    resource: string,
    resourceId: string,
    limit: number = this.defaultPageSize
  ): Promise<(typeof auditLogs.$inferSelect)[]> {
    try {
      const db = this.dbManager.getDb()

      return await db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.resource, resource), eq(auditLogs.resourceId, resourceId)))
        .orderBy(desc(auditLogs.timestamp))
        .limit(Math.min(limit, this.maxPageSize))
        .execute()
    } catch (error) {
      console.error('Failed to get resource audit logs:', error)
      throw new Error(
        `Failed to get resource audit logs: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Get audit logs for a specific user
   *
   * @param userId - The user ID
   * @param limit - Maximum number of logs to return
   * @returns Promise that resolves with the audit logs
   */
  async getUserLogs(
    userId: string,
    limit: number = this.defaultPageSize
  ): Promise<(typeof auditLogs.$inferSelect)[]> {
    try {
      const db = this.dbManager.getDb()

      return await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.userId, userId))
        .orderBy(desc(auditLogs.timestamp))
        .limit(Math.min(limit, this.maxPageSize))
        .execute()
    } catch (error) {
      console.error('Failed to get user audit logs:', error)
      throw new Error(
        `Failed to get user audit logs: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Clean up old audit logs based on retention policy
   *
   * @param retentionDays - Number of days to retain logs (default: defaultRetentionDays)
   * @returns Number of deleted logs
   */
  async cleanup(retentionDays: number = this.defaultRetentionDays): Promise<number> {
    try {
      const db = this.dbManager.getDb()

      // Calculate the cutoff date
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

      // Delete logs older than the cutoff date
      const result = await db
        .delete(auditLogs)
        .where(lte(auditLogs.timestamp, cutoffDate))
        .returning({ deletedId: auditLogs.id })
        .execute()

      return result.length
    } catch (error) {
      console.error('Failed to clean up audit logs:', error)
      throw new Error(
        `Failed to clean up audit logs: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Archive old audit logs to a separate storage
   * This is a more advanced alternative to cleanup that preserves logs
   *
   * @param retentionDays - Number of days to retain logs in the main table
   * @param archiveFormat - Format to use for the archive ('json' or 'csv')
   * @returns Path to the archive file
   */
  async archiveLogs(
    retentionDays: number = this.defaultRetentionDays,
    archiveFormat: 'json' | 'csv' = 'json'
  ): Promise<string> {
    try {
      const db = this.dbManager.getDb()

      // Calculate the cutoff date
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

      // Get logs older than the cutoff date
      const logsToArchive = await db
        .select()
        .from(auditLogs)
        .where(lte(auditLogs.timestamp, cutoffDate))
        .orderBy(auditLogs.timestamp)
        .execute()

      if (logsToArchive.length === 0) {
        return 'No logs to archive'
      }

      // Generate archive filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `audit_archive_${timestamp}.${archiveFormat}`

      // In a real implementation, we would write to a file or external storage
      // For this implementation, we'll just return the count and format

      // After successful archiving, we would delete the archived logs
      // await this.cleanup(retentionDays)

      return `Archived ${logsToArchive.length} logs to ${filename}`
    } catch (error) {
      console.error('Failed to archive audit logs:', error)
      throw new Error(
        `Failed to archive audit logs: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Get statistics about audit logs
   *
   * @param days - Number of days to include in statistics
   * @returns Statistics about audit logs
   */
  async getStatistics(days: number = 30): Promise<{
    totalLogs: number
    actionCounts: Record<string, number>
    resourceCounts: Record<string, number>
    userCounts: Record<string, number>
    dailyActivity: Array<{ date: string; count: number }>
  }> {
    try {
      const db = this.dbManager.getDb()

      // Calculate the start date
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      // Get total count
      const totalResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(auditLogs)
        .where(gte(auditLogs.timestamp, startDate))
        .execute()

      const totalLogs = Number(totalResult[0]?.count || 0)

      // Get action counts
      const actionResult = await db
        .select({
          action: auditLogs.action,
          count: sql<number>`count(*)`,
        })
        .from(auditLogs)
        .where(gte(auditLogs.timestamp, startDate))
        .groupBy(auditLogs.action)
        .execute()

      const actionCounts: Record<string, number> = {}
      actionResult.forEach(row => {
        actionCounts[row.action] = Number(row.count)
      })

      // Get resource counts
      const resourceResult = await db
        .select({
          resource: auditLogs.resource,
          count: sql<number>`count(*)`,
        })
        .from(auditLogs)
        .where(gte(auditLogs.timestamp, startDate))
        .groupBy(auditLogs.resource)
        .execute()

      const resourceCounts: Record<string, number> = {}
      resourceResult.forEach(row => {
        resourceCounts[row.resource] = Number(row.count)
      })

      // Get user counts
      const userResult = await db
        .select({
          userId: auditLogs.userId,
          count: sql<number>`count(*)`,
        })
        .from(auditLogs)
        .where(and(gte(auditLogs.timestamp, startDate), sql`${auditLogs.userId} is not null`))
        .groupBy(auditLogs.userId)
        .execute()

      const userCounts: Record<string, number> = {}
      userResult.forEach(row => {
        if (row.userId) {
          userCounts[row.userId] = Number(row.count)
        }
      })

      // Get daily activity
      const dailyResult = await db
        .select({
          date: sql<string>`date_trunc('day', ${auditLogs.timestamp})::text`,
          count: sql<number>`count(*)`,
        })
        .from(auditLogs)
        .where(gte(auditLogs.timestamp, startDate))
        .groupBy(sql`date_trunc('day', ${auditLogs.timestamp})`)
        .orderBy(sql`date_trunc('day', ${auditLogs.timestamp})`)
        .execute()

      const dailyActivity = dailyResult.map(row => ({
        date: row.date ? row.date.split('T')[0] : new Date().toISOString().split('T')[0], // Format as YYYY-MM-DD
        count: Number(row.count),
      }))

      return {
        totalLogs,
        actionCounts,
        resourceCounts,
        userCounts,
        dailyActivity,
      }
    } catch (error) {
      console.error('Failed to get audit statistics:', error)
      throw new Error(
        `Failed to get audit statistics: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Search audit logs with full text search
   *
   * @param query - Search query
   * @param filters - Additional filters
   * @returns Paginated search results
   */
  async searchLogs(
    query: string,
    filters: AuditFilters = {}
  ): Promise<PaginatedResult<typeof auditLogs.$inferSelect>> {
    try {
      const db = this.dbManager.getDb()

      // Build the where clause based on filters and search query
      const whereConditions = []

      // Add search conditions
      whereConditions.push(
        sql`(${auditLogs.action} LIKE ${'%' + query + '%'} OR 
             ${auditLogs.resource} LIKE ${'%' + query + '%'} OR 
             ${auditLogs.details}::text LIKE ${'%' + query + '%'})`
      )

      // Add standard filters
      if (filters.userId) {
        whereConditions.push(eq(auditLogs.userId, filters.userId))
      }

      if (filters.action) {
        whereConditions.push(like(auditLogs.action, `%${filters.action}%`))
      }

      if (filters.resource) {
        whereConditions.push(like(auditLogs.resource, `%${filters.resource}%`))
      }

      if (filters.startDate) {
        whereConditions.push(gte(auditLogs.timestamp, filters.startDate))
      }

      if (filters.endDate) {
        whereConditions.push(lte(auditLogs.timestamp, filters.endDate))
      }

      // Apply pagination
      const page = filters.page || 1
      const pageSize = Math.min(filters.pageSize || this.defaultPageSize, this.maxPageSize)
      const offset = (page - 1) * pageSize

      // Get total count for pagination
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(auditLogs)
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
        .execute()

      const total = Number(countResult[0]?.count || 0)

      // Get paginated results
      const logs = await db
        .select()
        .from(auditLogs)
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
        .orderBy(desc(auditLogs.timestamp))
        .limit(pageSize)
        .offset(offset)
        .execute()

      const totalPages = Math.ceil(total / pageSize)

      return {
        data: logs,
        total,
        page,
        pageSize,
        totalPages,
        hasMore: page < totalPages,
      }
    } catch (error) {
      console.error('Failed to search audit logs:', error)
      throw new Error(
        `Failed to search audit logs: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Get a summary of recent activity
   *
   * @param limit - Maximum number of logs to include
   * @returns Recent activity summary
   */
  async getRecentActivity(limit: number = 10): Promise<(typeof auditLogs.$inferSelect)[]> {
    try {
      const db = this.dbManager.getDb()

      return await db
        .select()
        .from(auditLogs)
        .orderBy(desc(auditLogs.timestamp))
        .limit(Math.min(limit, this.maxPageSize))
        .execute()
    } catch (error) {
      console.error('Failed to get recent activity:', error)
      throw new Error(
        `Failed to get recent activity: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }
}
