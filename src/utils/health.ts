/**
 * Health check utilities
 * Provides system health monitoring and status reporting
 */

import { DatabaseManager } from '../db/manager.js'
import { config } from './config.js'

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded'
  timestamp: string
  version: string
  environment: string
  uptime: number
  checks: {
    database: HealthCheck
    memory: HealthCheck
    disk?: HealthCheck
  }
}

export interface HealthCheck {
  status: 'pass' | 'fail' | 'warn'
  message: string
  responseTime?: number
  details?: Record<string, any>
}

export class HealthMonitor {
  private startTime: number
  private dbManager: DatabaseManager

  constructor(dbManager: DatabaseManager) {
    this.startTime = Date.now()
    this.dbManager = dbManager
  }

  /**
   * Perform comprehensive health check
   */
  async checkHealth(): Promise<HealthStatus> {
    const checks = {
      database: await this.checkDatabase(),
      memory: this.checkMemory(),
      ...(config.DATABASE_DIR && { disk: await this.checkDisk() })
    }

    // Determine overall status
    const hasFailures = Object.values(checks).some(check => check.status === 'fail')
    const hasWarnings = Object.values(checks).some(check => check.status === 'warn')
    
    let status: 'healthy' | 'unhealthy' | 'degraded'
    if (hasFailures) {
      status = 'unhealthy'
    } else if (hasWarnings) {
      status = 'degraded'
    } else {
      status = 'healthy'
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      version: config.APP_VERSION,
      environment: config.NODE_ENV,
      uptime: Date.now() - this.startTime,
      checks
    }
  }

  /**
   * Check database connectivity and performance
   */
  private async checkDatabase(): Promise<HealthCheck> {
    const startTime = Date.now()
    
    try {
      const db = this.dbManager.getDb()
      
      // Simple connectivity test
      await db.execute('SELECT 1 as test')
      
      const responseTime = Date.now() - startTime
      
      // Check response time
      if (responseTime > 1000) {
        return {
          status: 'warn',
          message: 'Database responding slowly',
          responseTime,
          details: { threshold: '1000ms' }
        }
      }
      
      return {
        status: 'pass',
        message: 'Database is healthy',
        responseTime
      }
      
    } catch (error) {
      return {
        status: 'fail',
        message: 'Database connection failed',
        responseTime: Date.now() - startTime,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      }
    }
  }

  /**
   * Check memory usage
   */
  private checkMemory(): HealthCheck {
    const memUsage = process.memoryUsage()
    const totalMB = Math.round(memUsage.rss / 1024 / 1024)
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024)
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024)
    
    // Warning if heap usage is over 80%
    const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100
    
    if (heapUsagePercent > 90) {
      return {
        status: 'fail',
        message: 'Memory usage critical',
        details: {
          rss: `${totalMB}MB`,
          heapUsed: `${heapUsedMB}MB`,
          heapTotal: `${heapTotalMB}MB`,
          heapUsagePercent: `${heapUsagePercent.toFixed(1)}%`
        }
      }
    }
    
    if (heapUsagePercent > 80) {
      return {
        status: 'warn',
        message: 'Memory usage high',
        details: {
          rss: `${totalMB}MB`,
          heapUsed: `${heapUsedMB}MB`,
          heapTotal: `${heapTotalMB}MB`,
          heapUsagePercent: `${heapUsagePercent.toFixed(1)}%`
        }
      }
    }
    
    return {
      status: 'pass',
      message: 'Memory usage normal',
      details: {
        rss: `${totalMB}MB`,
        heapUsed: `${heapUsedMB}MB`,
        heapTotal: `${heapTotalMB}MB`,
        heapUsagePercent: `${heapUsagePercent.toFixed(1)}%`
      }
    }
  }

  /**
   * Check disk space (if using file-based database)
   */
  private async checkDisk(): Promise<HealthCheck> {
    try {
      const fs = await import('fs/promises')
      const path = await import('path')
      
      if (!config.DATABASE_DIR) {
        return {
          status: 'pass',
          message: 'Using in-memory database'
        }
      }
      
      // Check if database directory exists and is accessible
      const dbPath = path.resolve(config.DATABASE_DIR)
      
      try {
        await fs.access(dbPath)
        const stats = await fs.stat(dbPath)
        
        return {
          status: 'pass',
          message: 'Database directory accessible',
          details: {
            path: dbPath,
            isDirectory: stats.isDirectory(),
            size: `${Math.round(stats.size / 1024)}KB`
          }
        }
      } catch (error) {
        return {
          status: 'warn',
          message: 'Database directory not accessible',
          details: {
            path: dbPath,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      }
      
    } catch (error) {
      return {
        status: 'fail',
        message: 'Disk check failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      }
    }
  }

  /**
   * Get system information
   */
  getSystemInfo() {
    return {
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch
      },
      app: {
        name: config.APP_NAME,
        version: config.APP_VERSION,
        environment: config.NODE_ENV,
        uptime: Date.now() - this.startTime
      },
      config: {
        port: config.PORT,
        host: config.HOST,
        database: config.DATABASE_DIR ? 'File-based' : 'In-memory',
        logLevel: config.LOG_LEVEL
      }
    }
  }
}