/**
 * Performance Monitoring Middleware
 * Tracks API endpoint performance and provides real-time metrics
 */

import { MiddlewareHandler } from 'hono'
import { PerformanceOptimizer } from '../utils/performance-optimizer'

export interface APIMetrics {
  endpoint: string
  method: string
  responseTime: number
  statusCode: number
  timestamp: number
  memoryUsage: NodeJS.MemoryUsage
  userAgent?: string
  ipAddress?: string
}

export interface EndpointStats {
  endpoint: string
  method: string
  totalRequests: number
  avgResponseTime: number
  minResponseTime: number
  maxResponseTime: number
  errorRate: number
  lastAccessed: Date
  p95ResponseTime: number
  p99ResponseTime: number
}

/**
 * Performance monitoring middleware that tracks API metrics
 */
export class PerformanceMonitor {
  private metrics: APIMetrics[] = []
  private endpointStats: Map<string, EndpointStats> = new Map()
  private maxMetricsHistory: number = 10000
  private optimizer?: PerformanceOptimizer

  constructor(options?: { 
    maxMetricsHistory?: number
    optimizer?: PerformanceOptimizer 
  }) {
    this.maxMetricsHistory = options?.maxMetricsHistory || 10000
    this.optimizer = options?.optimizer
  }

  /**
   * Create performance monitoring middleware
   */
  middleware(): MiddlewareHandler {
    return async (c, next) => {
      const startTime = performance.now()
      const memoryBefore = process.memoryUsage()
      const method = c.req.method
      const endpoint = this.normalizeEndpoint(c.req.path)
      
      // Add request ID for tracing
      const requestId = this.generateRequestId()
      c.set('requestId', requestId)
      c.set('startTime', startTime)

      try {
        await next()
      } finally {
        const endTime = performance.now()
        const responseTime = endTime - startTime
        const memoryAfter = process.memoryUsage()
        const statusCode = c.res.status
        
        // Record metrics
        const metric: APIMetrics = {
          endpoint,
          method,
          responseTime,
          statusCode,
          timestamp: Date.now(),
          memoryUsage: {
            heapUsed: memoryAfter.heapUsed - memoryBefore.heapUsed,
            heapTotal: memoryAfter.heapTotal - memoryBefore.heapTotal,
            external: memoryAfter.external - memoryBefore.external,
            rss: memoryAfter.rss - memoryBefore.rss
          },
          userAgent: c.req.header('user-agent'),
          ipAddress: this.getClientIP(c)
        }
        
        this.recordMetric(metric)
        
        // Record in optimizer if available
        if (this.optimizer) {
          this.optimizer.recordQuery(`API:${method}:${endpoint}`, responseTime)
        }
        
        // Add performance headers
        c.res.headers.set('X-Response-Time', `${responseTime.toFixed(2)}ms`)
        c.res.headers.set('X-Request-ID', requestId)
        
        // Log slow requests
        if (responseTime > 1000) {
          console.warn(`[PERF] Slow request: ${method} ${endpoint} - ${responseTime.toFixed(2)}ms`)
        }
      }
    }
  }

  /**
   * Record a metric and update endpoint statistics
   */
  private recordMetric(metric: APIMetrics): void {
    // Add to metrics history
    this.metrics.push(metric)
    
    // Trim history if it gets too large
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory)
    }
    
    // Update endpoint statistics
    const key = `${metric.method}:${metric.endpoint}`
    const existing = this.endpointStats.get(key)
    
    if (existing) {
      existing.totalRequests++
      existing.avgResponseTime = (existing.avgResponseTime * (existing.totalRequests - 1) + metric.responseTime) / existing.totalRequests
      existing.minResponseTime = Math.min(existing.minResponseTime, metric.responseTime)
      existing.maxResponseTime = Math.max(existing.maxResponseTime, metric.responseTime)
      existing.errorRate = this.calculateErrorRate(key)
      existing.lastAccessed = new Date()
      
      // Update percentiles
      const recentMetrics = this.getRecentMetrics(key, 100)
      const responseTimes = recentMetrics.map(m => m.responseTime).sort((a, b) => a - b)
      existing.p95ResponseTime = this.calculatePercentile(responseTimes, 0.95)
      existing.p99ResponseTime = this.calculatePercentile(responseTimes, 0.99)
    } else {
      this.endpointStats.set(key, {
        endpoint: metric.endpoint,
        method: metric.method,
        totalRequests: 1,
        avgResponseTime: metric.responseTime,
        minResponseTime: metric.responseTime,
        maxResponseTime: metric.responseTime,
        errorRate: metric.statusCode >= 400 ? 1 : 0,
        lastAccessed: new Date(),
        p95ResponseTime: metric.responseTime,
        p99ResponseTime: metric.responseTime
      })
    }
  }

  /**
   * Get performance metrics for a specific endpoint
   */
  getEndpointMetrics(method?: string, endpoint?: string): EndpointStats[] {
    const stats = Array.from(this.endpointStats.values())
    
    if (method && endpoint) {
      return stats.filter(s => s.method === method && s.endpoint === endpoint)
    } else if (method) {
      return stats.filter(s => s.method === method)
    } else if (endpoint) {
      return stats.filter(s => s.endpoint === endpoint)
    }
    
    return stats
  }

  /**
   * Get slow endpoints (avg response time > threshold)
   */
  getSlowEndpoints(thresholdMs: number = 500): EndpointStats[] {
    return Array.from(this.endpointStats.values())
      .filter(stats => stats.avgResponseTime > thresholdMs)
      .sort((a, b) => b.avgResponseTime - a.avgResponseTime)
  }

  /**
   * Get endpoints with high error rates
   */
  getHighErrorEndpoints(thresholdRate: number = 0.1): EndpointStats[] {
    return Array.from(this.endpointStats.values())
      .filter(stats => stats.errorRate > thresholdRate && stats.totalRequests > 10)
      .sort((a, b) => b.errorRate - a.errorRate)
  }

  /**
   * Get recent metrics for analysis
   */
  getRecentMetrics(endpointKey?: string, limit: number = 100): APIMetrics[] {
    let filtered = this.metrics
    
    if (endpointKey) {
      const [method, endpoint] = endpointKey.split(':')
      filtered = this.metrics.filter(m => m.method === method && m.endpoint === endpoint)
    }
    
    return filtered
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
  }

  /**
   * Generate performance summary report
   */
  getPerformanceSummary(): {
    totalRequests: number
    avgResponseTime: number
    errorRate: number
    slowEndpoints: EndpointStats[]
    highErrorEndpoints: EndpointStats[]
    memoryUsage: NodeJS.MemoryUsage
    uptime: number
  } {
    const totalRequests = this.metrics.length
    const avgResponseTime = totalRequests > 0 
      ? this.metrics.reduce((sum, m) => sum + m.responseTime, 0) / totalRequests 
      : 0
    const errorCount = this.metrics.filter(m => m.statusCode >= 400).length
    const errorRate = totalRequests > 0 ? errorCount / totalRequests : 0
    
    return {
      totalRequests,
      avgResponseTime,
      errorRate,
      slowEndpoints: this.getSlowEndpoints(200),
      highErrorEndpoints: this.getHighErrorEndpoints(0.05),
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    }
  }

  /**
   * Get real-time metrics for monitoring dashboard
   */
  getRealTimeMetrics(): {
    requestsPerSecond: number
    avgResponseTimeLast100: number
    errorRateLast100: number
    activeEndpoints: number
    memoryTrend: 'increasing' | 'decreasing' | 'stable'
  } {
    const now = Date.now()
    const oneSecondAgo = now - 1000
    const last100 = this.metrics.slice(-100)
    
    const recentRequests = this.metrics.filter(m => m.timestamp > oneSecondAgo)
    const requestsPerSecond = recentRequests.length
    
    const avgResponseTimeLast100 = last100.length > 0
      ? last100.reduce((sum, m) => sum + m.responseTime, 0) / last100.length
      : 0
    
    const errorRateLast100 = last100.length > 0
      ? last100.filter(m => m.statusCode >= 400).length / last100.length
      : 0
    
    const activeEndpoints = new Set(
      this.metrics
        .filter(m => m.timestamp > now - 60000) // Last minute
        .map(m => `${m.method}:${m.endpoint}`)
    ).size
    
    // Simple memory trend analysis
    const memoryTrend = this.analyzeMemoryTrend()
    
    return {
      requestsPerSecond,
      avgResponseTimeLast100,
      errorRateLast100,
      activeEndpoints,
      memoryTrend
    }
  }

  /**
   * Clear all metrics and statistics
   */
  reset(): void {
    this.metrics = []
    this.endpointStats.clear()
  }

  /**
   * Export metrics for external analysis
   */
  exportMetrics(): {
    metrics: APIMetrics[]
    endpointStats: EndpointStats[]
    summary: ReturnType<typeof this.getPerformanceSummary>
  } {
    return {
      metrics: [...this.metrics],
      endpointStats: Array.from(this.endpointStats.values()),
      summary: this.getPerformanceSummary()
    }
  }

  /**
   * Normalize endpoint path for consistent tracking
   */
  private normalizeEndpoint(path: string): string {
    // Replace UUIDs and numeric IDs with placeholders
    return path
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
      .replace(/\/\d+/g, '/:id')
      .replace(/\/[a-zA-Z0-9_-]{20,}/g, '/:token') // API keys or long tokens
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get client IP address
   */
  private getClientIP(c: any): string {
    return c.req.header('x-forwarded-for') || 
           c.req.header('x-real-ip') || 
           c.req.header('cf-connecting-ip') ||
           'unknown'
  }

  /**
   * Calculate error rate for an endpoint
   */
  private calculateErrorRate(endpointKey: string): number {
    const [method, endpoint] = endpointKey.split(':')
    const endpointMetrics = this.metrics.filter(m => 
      m.method === method && m.endpoint === endpoint
    )
    
    if (endpointMetrics.length === 0) return 0
    
    const errorCount = endpointMetrics.filter(m => m.statusCode >= 400).length
    return errorCount / endpointMetrics.length
  }

  /**
   * Calculate percentile from sorted array
   */
  private calculatePercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0
    
    const index = Math.ceil(sortedArray.length * percentile) - 1
    return sortedArray[Math.max(0, index)]
  }

  /**
   * Analyze memory usage trend
   */
  private analyzeMemoryTrend(): 'increasing' | 'decreasing' | 'stable' {
    if (this.metrics.length < 10) return 'stable'
    
    const recent = this.metrics.slice(-10)
    const older = this.metrics.slice(-20, -10)
    
    if (recent.length === 0 || older.length === 0) return 'stable'
    
    const recentAvg = recent.reduce((sum, m) => sum + m.memoryUsage.heapUsed, 0) / recent.length
    const olderAvg = older.reduce((sum, m) => sum + m.memoryUsage.heapUsed, 0) / older.length
    
    const threshold = olderAvg * 0.1 // 10% threshold
    
    if (recentAvg > olderAvg + threshold) return 'increasing'
    if (recentAvg < olderAvg - threshold) return 'decreasing'
    return 'stable'
  }
}

/**
 * Create performance monitoring middleware instance
 */
export function createPerformanceMiddleware(options?: {
  maxMetricsHistory?: number
  optimizer?: PerformanceOptimizer
}): { middleware: MiddlewareHandler; monitor: PerformanceMonitor } {
  const monitor = new PerformanceMonitor(options)
  return {
    middleware: monitor.middleware(),
    monitor
  }
}