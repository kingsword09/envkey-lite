#!/usr/bin/env tsx

/**
 * Performance Monitoring Script
 * Continuously monitors the application performance and generates reports
 */

import { DatabaseManager } from '../src/db/manager'
import { CryptoService } from '../src/services/crypto.service'
import { PerformanceOptimizer } from '../src/utils/performance-optimizer'
import { PerformanceMonitor } from '../src/middleware/performance.middleware'
import { UserService } from '../src/services/user.service'
import { ProjectService } from '../src/services/project.service'
import { EnvironmentVariableService } from '../src/services/environment.service'
import { AuditService } from '../src/services/audit.service'

interface MonitoringConfig {
  interval: number // Monitoring interval in seconds
  reportInterval: number // Report generation interval in seconds
  optimizeInterval: number // Database optimization interval in seconds
  cleanupInterval: number // Cleanup interval in seconds
  auditRetentionDays: number // Audit log retention in days
}

class PerformanceMonitoringService {
  private dbManager: DatabaseManager
  private cryptoService: CryptoService
  private optimizer: PerformanceOptimizer
  private monitor: PerformanceMonitor
  private userService: UserService
  private projectService: ProjectService
  private environmentService: EnvironmentVariableService
  private auditService: AuditService
  private config: MonitoringConfig
  private isRunning = false
  private intervals: NodeJS.Timeout[] = []

  constructor(config: MonitoringConfig) {
    this.config = config
    this.dbManager = new DatabaseManager({ debug: false })
    this.cryptoService = new CryptoService(this.dbManager)
    this.optimizer = new PerformanceOptimizer(this.dbManager)
    this.monitor = new PerformanceMonitor({ optimizer: this.optimizer })
    
    this.userService = new UserService(this.dbManager, this.cryptoService)
    this.projectService = new ProjectService(this.dbManager)
    this.environmentService = new EnvironmentVariableService(this.dbManager, this.cryptoService)
    this.auditService = new AuditService(this.dbManager)
  }

  async initialize(): Promise<void> {
    console.log('🚀 Initializing Performance Monitoring Service...')
    
    await this.dbManager.initialize()
    await this.cryptoService.initialize()
    
    console.log('✅ Performance Monitoring Service initialized')
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  Performance monitoring is already running')
      return
    }

    this.isRunning = true
    console.log('📊 Starting performance monitoring...')

    // Start periodic monitoring
    this.intervals.push(
      setInterval(() => this.collectMetrics(), this.config.interval * 1000)
    )

    // Start periodic reporting
    this.intervals.push(
      setInterval(() => this.generateReport(), this.config.reportInterval * 1000)
    )

    // Start periodic optimization
    this.intervals.push(
      setInterval(() => this.optimizeDatabase(), this.config.optimizeInterval * 1000)
    )

    // Start periodic cleanup
    this.intervals.push(
      setInterval(() => this.performCleanup(), this.config.cleanupInterval * 1000)
    )

    console.log('✅ Performance monitoring started')
    console.log(`📈 Metrics collection interval: ${this.config.interval}s`)
    console.log(`📋 Report generation interval: ${this.config.reportInterval}s`)
    console.log(`🔧 Database optimization interval: ${this.config.optimizeInterval}s`)
    console.log(`🧹 Cleanup interval: ${this.config.cleanupInterval}s`)
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('⚠️  Performance monitoring is not running')
      return
    }

    this.isRunning = false
    console.log('🛑 Stopping performance monitoring...')

    // Clear all intervals
    this.intervals.forEach(interval => clearInterval(interval))
    this.intervals = []

    await this.dbManager.close()
    console.log('✅ Performance monitoring stopped')
  }

  private async collectMetrics(): Promise<void> {
    try {
      const timestamp = new Date().toISOString()
      
      // Collect system metrics
      const memoryUsage = process.memoryUsage()
      const cpuUsage = process.cpuUsage()
      const uptime = process.uptime()
      
      // Collect database metrics
      const dbStats = await this.optimizer.getDatabaseStats()
      
      // Collect performance metrics
      const performanceSummary = this.monitor.getPerformanceSummary()
      const realTimeMetrics = this.monitor.getRealTimeMetrics()
      
      // Log metrics (in production, you might want to send these to a monitoring service)
      console.log(`[${timestamp}] Performance Metrics:`)
      console.log(`  Memory: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB heap, ${(memoryUsage.rss / 1024 / 1024).toFixed(2)}MB RSS`)
      console.log(`  CPU: ${cpuUsage.user}μs user, ${cpuUsage.system}μs system`)
      console.log(`  Uptime: ${(uptime / 60).toFixed(1)} minutes`)
      console.log(`  Requests/sec: ${realTimeMetrics.requestsPerSecond}`)
      console.log(`  Avg Response Time: ${realTimeMetrics.avgResponseTimeLast100.toFixed(2)}ms`)
      console.log(`  Error Rate: ${(realTimeMetrics.errorRateLast100 * 100).toFixed(2)}%`)
      console.log(`  Active Endpoints: ${realTimeMetrics.activeEndpoints}`)
      console.log(`  Memory Trend: ${realTimeMetrics.memoryTrend}`)
      
      if (dbStats.tableStats.length > 0) {
        console.log(`  Database Tables: ${dbStats.tableStats.length}`)
        console.log(`  Database Indexes: ${dbStats.indexStats.length}`)
      }
      
    } catch (error) {
      console.error('❌ Error collecting metrics:', error)
    }
  }

  private async generateReport(): Promise<void> {
    try {
      console.log('\n📊 Generating Performance Report...')
      
      const report = await this.optimizer.generatePerformanceReport()
      const performanceSummary = this.monitor.getPerformanceSummary()
      
      console.log('='.repeat(60))
      console.log('PERFORMANCE REPORT')
      console.log('='.repeat(60))
      console.log(`Generated: ${new Date().toISOString()}`)
      console.log(`Uptime: ${(report.systemMetrics.uptime / 60).toFixed(1)} minutes`)
      console.log()
      
      // API Performance
      console.log('API PERFORMANCE:')
      console.log(`  Total Requests: ${performanceSummary.totalRequests}`)
      console.log(`  Average Response Time: ${performanceSummary.avgResponseTime.toFixed(2)}ms`)
      console.log(`  Error Rate: ${(performanceSummary.errorRate * 100).toFixed(2)}%`)
      console.log()
      
      // Slow Endpoints
      if (performanceSummary.slowEndpoints.length > 0) {
        console.log('SLOW ENDPOINTS:')
        performanceSummary.slowEndpoints.slice(0, 5).forEach((endpoint, index) => {
          console.log(`  ${index + 1}. ${endpoint.method} ${endpoint.endpoint}`)
          console.log(`     Avg: ${endpoint.avgResponseTime.toFixed(2)}ms, P95: ${endpoint.p95ResponseTime.toFixed(2)}ms`)
        })
        console.log()
      }
      
      // High Error Endpoints
      if (performanceSummary.highErrorEndpoints.length > 0) {
        console.log('HIGH ERROR ENDPOINTS:')
        performanceSummary.highErrorEndpoints.slice(0, 5).forEach((endpoint, index) => {
          console.log(`  ${index + 1}. ${endpoint.method} ${endpoint.endpoint}`)
          console.log(`     Error Rate: ${(endpoint.errorRate * 100).toFixed(2)}%, Requests: ${endpoint.totalRequests}`)
        })
        console.log()
      }
      
      // Database Performance
      if (report.slowQueries.length > 0) {
        console.log('SLOW QUERIES:')
        report.slowQueries.slice(0, 5).forEach((query, index) => {
          console.log(`  ${index + 1}. ${query.query.substring(0, 60)}...`)
          console.log(`     Avg: ${query.avgDuration.toFixed(2)}ms, Max: ${query.maxDuration.toFixed(2)}ms, Count: ${query.executionCount}`)
        })
        console.log()
      }
      
      // Optimization Suggestions
      if (report.suggestions.length > 0) {
        console.log('OPTIMIZATION SUGGESTIONS:')
        report.suggestions.forEach((suggestion, index) => {
          console.log(`  ${index + 1}. [${suggestion.impact.toUpperCase()}] ${suggestion.type}`)
          console.log(`     ${suggestion.description}`)
          console.log(`     Implementation: ${suggestion.implementation}`)
        })
        console.log()
      }
      
      // Memory Usage
      console.log('MEMORY USAGE:')
      console.log(`  Current Heap: ${(report.memoryUsage.current.heapUsed / 1024 / 1024).toFixed(2)}MB`)
      console.log(`  Peak Heap: ${(report.memoryUsage.peak.heapUsed / 1024 / 1024).toFixed(2)}MB`)
      console.log(`  RSS: ${(report.memoryUsage.current.rss / 1024 / 1024).toFixed(2)}MB`)
      console.log()
      
      console.log('='.repeat(60))
      console.log()
      
    } catch (error) {
      console.error('❌ Error generating report:', error)
    }
  }

  private async optimizeDatabase(): Promise<void> {
    try {
      console.log('🔧 Running database optimization...')
      
      const { applied, errors } = await this.optimizer.optimizeDatabase()
      
      if (applied.length > 0) {
        console.log(`✅ Applied ${applied.length} optimizations:`)
        applied.forEach(optimization => {
          console.log(`  - ${optimization}`)
        })
      }
      
      if (errors.length > 0) {
        console.log(`⚠️  ${errors.length} optimization errors:`)
        errors.forEach(error => {
          console.log(`  - ${error}`)
        })
      }
      
      if (applied.length === 0 && errors.length === 0) {
        console.log('ℹ️  No optimizations needed')
      }
      
    } catch (error) {
      console.error('❌ Error during database optimization:', error)
    }
  }

  private async performCleanup(): Promise<void> {
    try {
      console.log('🧹 Performing cleanup...')
      
      // Clean up old audit logs
      const deletedLogs = await this.optimizer.cleanupAuditLogs(this.config.auditRetentionDays)
      
      if (deletedLogs > 0) {
        console.log(`✅ Cleaned up ${deletedLogs} old audit log entries`)
      } else {
        console.log('ℹ️  No audit logs to clean up')
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc()
        console.log('♻️  Forced garbage collection')
      }
      
    } catch (error) {
      console.error('❌ Error during cleanup:', error)
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2)
  const command = args[0] || 'start'
  
  const config: MonitoringConfig = {
    interval: parseInt(process.env.MONITOR_INTERVAL || '30'), // 30 seconds
    reportInterval: parseInt(process.env.REPORT_INTERVAL || '300'), // 5 minutes
    optimizeInterval: parseInt(process.env.OPTIMIZE_INTERVAL || '3600'), // 1 hour
    cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL || '86400'), // 24 hours
    auditRetentionDays: parseInt(process.env.AUDIT_RETENTION_DAYS || '90') // 90 days
  }
  
  const monitoringService = new PerformanceMonitoringService(config)
  
  try {
    await monitoringService.initialize()
    
    switch (command) {
      case 'start':
        await monitoringService.start()
        
        // Handle graceful shutdown
        process.on('SIGINT', async () => {
          console.log('\n🛑 Received SIGINT, shutting down gracefully...')
          await monitoringService.stop()
          process.exit(0)
        })
        
        process.on('SIGTERM', async () => {
          console.log('\n🛑 Received SIGTERM, shutting down gracefully...')
          await monitoringService.stop()
          process.exit(0)
        })
        
        // Keep the process running
        await new Promise(() => {})
        break
        
      case 'report':
        await monitoringService.generateReport()
        await monitoringService.stop()
        break
        
      case 'optimize':
        await monitoringService.optimizeDatabase()
        await monitoringService.stop()
        break
        
      case 'cleanup':
        await monitoringService.performCleanup()
        await monitoringService.stop()
        break
        
      default:
        console.log('Usage: tsx scripts/performance-monitor.ts [start|report|optimize|cleanup]')
        console.log('')
        console.log('Commands:')
        console.log('  start    - Start continuous performance monitoring (default)')
        console.log('  report   - Generate a one-time performance report')
        console.log('  optimize - Run database optimization once')
        console.log('  cleanup  - Run cleanup tasks once')
        console.log('')
        console.log('Environment Variables:')
        console.log('  MONITOR_INTERVAL      - Metrics collection interval in seconds (default: 30)')
        console.log('  REPORT_INTERVAL       - Report generation interval in seconds (default: 300)')
        console.log('  OPTIMIZE_INTERVAL     - Database optimization interval in seconds (default: 3600)')
        console.log('  CLEANUP_INTERVAL      - Cleanup interval in seconds (default: 86400)')
        console.log('  AUDIT_RETENTION_DAYS  - Audit log retention in days (default: 90)')
        process.exit(1)
    }
    
  } catch (error) {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}