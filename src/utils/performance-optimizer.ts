/**
 * Performance Optimizer
 * Provides utilities for identifying and optimizing slow database queries and API endpoints
 */

import { DatabaseManager } from '../db/manager'
import { sql } from 'drizzle-orm'

export interface QueryPerformanceMetrics {
  query: string
  avgDuration: number
  maxDuration: number
  minDuration: number
  executionCount: number
  totalDuration: number
  lastExecuted: Date
}

export interface OptimizationSuggestion {
  type: 'index' | 'query_rewrite' | 'caching' | 'pagination'
  description: string
  impact: 'high' | 'medium' | 'low'
  implementation: string
}

export interface PerformanceReport {
  slowQueries: QueryPerformanceMetrics[]
  suggestions: OptimizationSuggestion[]
  memoryUsage: {
    current: NodeJS.MemoryUsage
    peak: NodeJS.MemoryUsage
  }
  systemMetrics: {
    uptime: number
    loadAverage: number[]
    cpuUsage: NodeJS.CpuUsage
  }
}

/**
 * Performance monitoring and optimization utility
 */
export class PerformanceOptimizer {
  private dbManager: DatabaseManager
  private queryMetrics: Map<string, QueryPerformanceMetrics> = new Map()
  private memoryPeak: NodeJS.MemoryUsage
  private startTime: number
  private cpuUsageStart: NodeJS.CpuUsage

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager
    this.memoryPeak = process.memoryUsage()
    this.startTime = Date.now()
    this.cpuUsageStart = process.cpuUsage()
    
    // Monitor memory usage
    this.startMemoryMonitoring()
  }

  /**
   * Record query execution metrics
   */
  recordQuery(query: string, duration: number): void {
    const existing = this.queryMetrics.get(query)
    
    if (existing) {
      existing.executionCount++
      existing.totalDuration += duration
      existing.avgDuration = existing.totalDuration / existing.executionCount
      existing.maxDuration = Math.max(existing.maxDuration, duration)
      existing.minDuration = Math.min(existing.minDuration, duration)
      existing.lastExecuted = new Date()
    } else {
      this.queryMetrics.set(query, {
        query,
        avgDuration: duration,
        maxDuration: duration,
        minDuration: duration,
        executionCount: 1,
        totalDuration: duration,
        lastExecuted: new Date()
      })
    }
  }

  /**
   * Get slow queries (queries with avg duration > threshold)
   */
  getSlowQueries(thresholdMs: number = 100): QueryPerformanceMetrics[] {
    return Array.from(this.queryMetrics.values())
      .filter(metric => metric.avgDuration > thresholdMs)
      .sort((a, b) => b.avgDuration - a.avgDuration)
  }

  /**
   * Generate optimization suggestions based on query patterns
   */
  generateOptimizationSuggestions(): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = []
    const slowQueries = this.getSlowQueries(50)

    for (const query of slowQueries) {
      // Suggest indexes for WHERE clauses
      if (query.query.includes('WHERE') && query.avgDuration > 100) {
        suggestions.push({
          type: 'index',
          description: `Add index for WHERE clause in query: ${query.query.substring(0, 100)}...`,
          impact: 'high',
          implementation: 'CREATE INDEX ON table_name (column_name);'
        })
      }

      // Suggest pagination for large result sets
      if (query.query.includes('SELECT') && !query.query.includes('LIMIT') && query.avgDuration > 200) {
        suggestions.push({
          type: 'pagination',
          description: `Add pagination to query: ${query.query.substring(0, 100)}...`,
          impact: 'medium',
          implementation: 'Add LIMIT and OFFSET clauses to query'
        })
      }

      // Suggest caching for frequently executed queries
      if (query.executionCount > 50 && query.avgDuration > 50) {
        suggestions.push({
          type: 'caching',
          description: `Cache results for frequently executed query: ${query.query.substring(0, 100)}...`,
          impact: 'medium',
          implementation: 'Implement Redis or in-memory caching for this query'
        })
      }

      // Suggest query rewrite for complex joins
      if (query.query.includes('JOIN') && query.avgDuration > 300) {
        suggestions.push({
          type: 'query_rewrite',
          description: `Optimize complex JOIN query: ${query.query.substring(0, 100)}...`,
          impact: 'high',
          implementation: 'Consider breaking into smaller queries or using subqueries'
        })
      }
    }

    return suggestions
  }

  /**
   * Generate comprehensive performance report
   */
  async generatePerformanceReport(): Promise<PerformanceReport> {
    const slowQueries = this.getSlowQueries(50)
    const suggestions = this.generateOptimizationSuggestions()
    const currentMemory = process.memoryUsage()
    const cpuUsage = process.cpuUsage(this.cpuUsageStart)
    const uptime = (Date.now() - this.startTime) / 1000

    return {
      slowQueries,
      suggestions,
      memoryUsage: {
        current: currentMemory,
        peak: this.memoryPeak
      },
      systemMetrics: {
        uptime,
        loadAverage: process.platform === 'linux' ? (await import('os')).loadavg() : [0, 0, 0],
        cpuUsage
      }
    }
  }

  /**
   * Optimize database by creating suggested indexes
   */
  async optimizeDatabase(): Promise<{ applied: string[], errors: string[] }> {
    const applied: string[] = []
    const errors: string[] = []
    const db = this.dbManager.getDb()

    try {
      // Create common performance indexes
      const indexQueries = [
        // User lookup optimizations
        'CREATE INDEX IF NOT EXISTS idx_users_email_hash ON users USING hash (email)',
        'CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys USING hash (key_hash)',
        
        // Project and environment lookups
        'CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects (owner_id)',
        'CREATE INDEX IF NOT EXISTS idx_environments_project_id ON environments (project_id)',
        'CREATE INDEX IF NOT EXISTS idx_environments_name ON environments (project_id, name)',
        
        // Environment variables optimizations
        'CREATE INDEX IF NOT EXISTS idx_env_vars_env_id ON environment_variables (environment_id)',
        'CREATE INDEX IF NOT EXISTS idx_env_vars_key ON environment_variables (environment_id, key)',
        'CREATE INDEX IF NOT EXISTS idx_env_vars_sensitive ON environment_variables (environment_id, sensitive)',
        
        // Permission lookups
        'CREATE INDEX IF NOT EXISTS idx_project_permissions_user_project ON project_permissions (user_id, project_id)',
        
        // Audit log optimizations
        'CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id)',
        'CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp DESC)',
        'CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs (resource, resource_id)',
        'CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action)',
        
        // Composite indexes for common query patterns
        'CREATE INDEX IF NOT EXISTS idx_env_vars_composite ON environment_variables (environment_id, sensitive, key)',
        'CREATE INDEX IF NOT EXISTS idx_audit_logs_composite ON audit_logs (user_id, timestamp DESC, action)'
      ]

      for (const indexQuery of indexQueries) {
        try {
          await db.execute(sql.raw(indexQuery))
          applied.push(indexQuery)
        } catch (_error) {
          const errorMessage = _error instanceof Error ? _error.message : 'Unknown error'
          errors.push(`Failed to create index: ${indexQuery} - ${errorMessage}`)
        }
      }

      // Analyze tables for better query planning (PostgreSQL specific)
      try {
        await db.execute(sql.raw('ANALYZE'))
        applied.push('ANALYZE - Updated table statistics')
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        errors.push(`Failed to analyze tables: ${errorMessage}`)
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      errors.push(`Database optimization failed: ${errorMessage}`)
    }

    return { applied, errors }
  }

  /**
   * Clean up old audit logs to improve performance
   */
  async cleanupAuditLogs(retentionDays: number = 90): Promise<number> {
    const db = this.dbManager.getDb()
    const schema = this.dbManager.getSchema()
    
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)
    
    const result = await db
      .delete(schema.auditLogs)
      .where(sql`${schema.auditLogs.timestamp} < ${cutoffDate}`)
      .returning({ id: schema.auditLogs.id })
    
    return result.length
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<{
    tableStats: Array<{
      tableName: string
      rowCount: number
      sizeBytes: number
    }>
    indexStats: Array<{
      indexName: string
      tableName: string
      sizeBytes: number
      scans: number
    }>
  }> {
    const db = this.dbManager.getDb()
    
    try {
      // Get table statistics (PostgreSQL specific)
      const tableStatsQuery = sql.raw(`
        SELECT 
          schemaname,
          tablename as table_name,
          n_tup_ins + n_tup_upd + n_tup_del as row_count,
          pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
        FROM pg_stat_user_tables
        ORDER BY size_bytes DESC
      `)
      
      const indexStatsQuery = sql.raw(`
        SELECT 
          indexrelname as index_name,
          tablename as table_name,
          pg_relation_size(indexrelid) as size_bytes,
          idx_scan as scans
        FROM pg_stat_user_indexes
        ORDER BY size_bytes DESC
      `)
      
      const [tableStats, indexStats] = await Promise.all([
        db.execute(tableStatsQuery),
        db.execute(indexStatsQuery)
      ])
      
      return {
        tableStats: tableStats.rows.map((row: Record<string, unknown>) => ({
          tableName: row.table_name as string,
          rowCount: parseInt(row.row_count as string) || 0,
          sizeBytes: parseInt(row.size_bytes as string) || 0
        })),
        indexStats: indexStats.rows.map((row: Record<string, unknown>) => ({
          indexName: row.index_name as string,
          tableName: row.table_name as string,
          sizeBytes: parseInt(row.size_bytes as string) || 0,
          scans: parseInt(row.scans as string) || 0
        }))
      }
    } catch (_error) {
      // Fallback for non-PostgreSQL databases
      return {
        tableStats: [],
        indexStats: []
      }
    }
  }

  /**
   * Start monitoring memory usage
   */
  private startMemoryMonitoring(): void {
    setInterval(() => {
      const current = process.memoryUsage()
      
      // Update peak memory usage
      if (current.heapUsed > this.memoryPeak.heapUsed) {
        this.memoryPeak = current
      }
    }, 5000) // Check every 5 seconds
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.queryMetrics.clear()
    this.memoryPeak = process.memoryUsage()
    this.startTime = Date.now()
    this.cpuUsageStart = process.cpuUsage()
  }

  /**
   * Get current metrics summary
   */
  getMetricsSummary(): {
    totalQueries: number
    slowQueries: number
    avgQueryTime: number
    memoryUsage: NodeJS.MemoryUsage
  } {
    const metrics = Array.from(this.queryMetrics.values())
    const slowQueries = metrics.filter(m => m.avgDuration > 100)
    const totalDuration = metrics.reduce((sum, m) => sum + m.totalDuration, 0)
    const totalExecutions = metrics.reduce((sum, m) => sum + m.executionCount, 0)
    
    return {
      totalQueries: metrics.length,
      slowQueries: slowQueries.length,
      avgQueryTime: totalExecutions > 0 ? totalDuration / totalExecutions : 0,
      memoryUsage: process.memoryUsage()
    }
  }
}

/**
 * Query performance monitoring decorator
 */
export function monitorQuery(optimizer: PerformanceOptimizer) {
  return function (target: unknown, propertyName: string, descriptor: PropertyDescriptor): PropertyDescriptor {
    const method = descriptor.value
    
    descriptor.value = async function (...args: unknown[]): Promise<unknown> {
      const startTime = performance.now()
      
      try {
        const result = await (method as (...args: unknown[]) => Promise<unknown>).apply(this, args)
        const duration = performance.now() - startTime
        
        optimizer.recordQuery(`${(target as { constructor: { name: string } }).constructor.name}.${propertyName}`, duration)
        
        return result
      } catch (error) {
        const duration = performance.now() - startTime
        optimizer.recordQuery(`${(target as { constructor: { name: string } }).constructor.name}.${propertyName} (ERROR)`, duration)
        throw error
      }
    }
    
    return descriptor
  }
}