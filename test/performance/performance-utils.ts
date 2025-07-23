/**
 * Performance testing utilities for envkey-lite
 * Provides tools for measuring API response times, database query performance,
 * and identifying bottlenecks
 */

export interface PerformanceMetrics {
  duration: number
  memoryUsage: {
    heapUsed: number
    heapTotal: number
    external: number
    rss: number
  }
  timestamp: number
}

export interface APIPerformanceResult {
  endpoint: string
  method: string
  statusCode: number
  responseTime: number
  memoryBefore: NodeJS.MemoryUsage
  memoryAfter: NodeJS.MemoryUsage
  timestamp: number
}

export interface DatabaseQueryResult {
  query: string
  duration: number
  rowsAffected?: number
  memoryUsage: NodeJS.MemoryUsage
  timestamp: number
}

/**
 * Measures the performance of a function execution
 */
export async function measurePerformance<T>(
  fn: () => Promise<T> | T,
  label?: string
): Promise<{ result: T; metrics: PerformanceMetrics }> {
  const startTime = performance.now()
  const startMemory = process.memoryUsage()
  
  const result = await fn()
  
  const endTime = performance.now()
  const endMemory = process.memoryUsage()
  
  const metrics: PerformanceMetrics = {
    duration: endTime - startTime,
    memoryUsage: {
      heapUsed: endMemory.heapUsed - startMemory.heapUsed,
      heapTotal: endMemory.heapTotal - startMemory.heapTotal,
      external: endMemory.external - startMemory.external,
      rss: endMemory.rss - startMemory.rss
    },
    timestamp: Date.now()
  }
  
  if (label) {
    console.log(`[PERF] ${label}: ${metrics.duration.toFixed(2)}ms`)
  }
  
  return { result, metrics }
}

/**
 * Measures API endpoint performance
 */
export async function measureAPIPerformance(
  request: () => Promise<Response>,
  endpoint: string,
  method: string
): Promise<APIPerformanceResult> {
  const memoryBefore = process.memoryUsage()
  const startTime = performance.now()
  
  const response = await request()
  
  const endTime = performance.now()
  const memoryAfter = process.memoryUsage()
  
  return {
    endpoint,
    method,
    statusCode: response.status,
    responseTime: endTime - startTime,
    memoryBefore,
    memoryAfter,
    timestamp: Date.now()
  }
}

/**
 * Measures database query performance
 */
export async function measureDatabaseQuery<T>(
  queryFn: () => Promise<T>,
  queryDescription: string
): Promise<{ result: T; metrics: DatabaseQueryResult }> {
  const startTime = performance.now()
  const memoryBefore = process.memoryUsage()
  
  const result = await queryFn()
  
  const endTime = performance.now()
  const memoryAfter = process.memoryUsage()
  
  const metrics: DatabaseQueryResult = {
    query: queryDescription,
    duration: endTime - startTime,
    rowsAffected: Array.isArray(result) ? result.length : undefined,
    memoryUsage: {
      heapUsed: memoryAfter.heapUsed - memoryBefore.heapUsed,
      heapTotal: memoryAfter.heapTotal - memoryBefore.heapTotal,
      external: memoryAfter.external - memoryBefore.external,
      rss: memoryAfter.rss - memoryBefore.rss
    },
    timestamp: Date.now()
  }
  
  return { result, metrics }
}

/**
 * Runs a performance test multiple times and calculates statistics
 */
export async function runPerformanceTest<T>(
  testFn: () => Promise<T>,
  iterations: number = 10,
  label?: string
): Promise<{
  results: T[]
  stats: {
    min: number
    max: number
    avg: number
    median: number
    p95: number
    p99: number
  }
}> {
  const results: T[] = []
  const durations: number[] = []
  
  console.log(`[PERF] Running ${iterations} iterations of ${label || 'test'}...`)
  
  for (let i = 0; i < iterations; i++) {
    const { result, metrics } = await measurePerformance(testFn)
    results.push(result)
    durations.push(metrics.duration)
    
    // Add small delay between iterations to avoid overwhelming the system
    if (i < iterations - 1) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }
  
  // Calculate statistics
  const sortedDurations = durations.sort((a, b) => a - b)
  const stats = {
    min: Math.min(...durations),
    max: Math.max(...durations),
    avg: durations.reduce((sum, d) => sum + d, 0) / durations.length,
    median: sortedDurations[Math.floor(sortedDurations.length / 2)],
    p95: sortedDurations[Math.floor(sortedDurations.length * 0.95)],
    p99: sortedDurations[Math.floor(sortedDurations.length * 0.99)]
  }
  
  console.log(`[PERF] ${label || 'Test'} Statistics:`)
  console.log(`  Min: ${stats.min.toFixed(2)}ms`)
  console.log(`  Max: ${stats.max.toFixed(2)}ms`)
  console.log(`  Avg: ${stats.avg.toFixed(2)}ms`)
  console.log(`  Median: ${stats.median.toFixed(2)}ms`)
  console.log(`  P95: ${stats.p95.toFixed(2)}ms`)
  console.log(`  P99: ${stats.p99.toFixed(2)}ms`)
  
  return { results, stats }
}

/**
 * Creates a load test that runs multiple concurrent requests
 */
export async function runLoadTest<T>(
  testFn: () => Promise<T>,
  concurrency: number = 10,
  duration: number = 5000, // 5 seconds
  label?: string
): Promise<{
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  requestsPerSecond: number
  avgResponseTime: number
  errors: Error[]
}> {
  const startTime = Date.now()
  const endTime = startTime + duration
  const results: { success: boolean; duration: number; error?: Error }[] = []
  const activePromises: Promise<void>[] = []
  
  console.log(`[LOAD] Starting load test: ${concurrency} concurrent requests for ${duration}ms`)
  
  // Function to run a single request
  const runSingleRequest = async (): Promise<void> => {
    const requestStart = performance.now()
    try {
      await testFn()
      const requestEnd = performance.now()
      results.push({ success: true, duration: requestEnd - requestStart })
    } catch (error) {
      const requestEnd = performance.now()
      results.push({ 
        success: false, 
        duration: requestEnd - requestStart, 
        error: error as Error 
      })
    }
  }
  
  // Start initial concurrent requests
  for (let i = 0; i < concurrency; i++) {
    activePromises.push(runSingleRequest())
  }
  
  // Keep running requests until duration expires
  while (Date.now() < endTime) {
    // Wait for at least one request to complete
    await Promise.race(activePromises)
    
    // Remove completed promises and start new ones
    for (let i = activePromises.length - 1; i >= 0; i--) {
      const promise = activePromises[i]
      if (await Promise.race([promise, Promise.resolve('pending')]) !== 'pending') {
        activePromises.splice(i, 1)
        if (Date.now() < endTime) {
          activePromises.push(runSingleRequest())
        }
      }
    }
  }
  
  // Wait for remaining requests to complete
  await Promise.all(activePromises)
  
  const actualDuration = Date.now() - startTime
  const successfulRequests = results.filter(r => r.success).length
  const failedRequests = results.filter(r => !r.success).length
  const avgResponseTime = results.reduce((sum, r) => sum + r.duration, 0) / results.length
  const errors = results.filter(r => r.error).map(r => r.error!)
  
  const stats = {
    totalRequests: results.length,
    successfulRequests,
    failedRequests,
    requestsPerSecond: (results.length / actualDuration) * 1000,
    avgResponseTime,
    errors
  }
  
  console.log(`[LOAD] ${label || 'Load test'} Results:`)
  console.log(`  Total Requests: ${stats.totalRequests}`)
  console.log(`  Successful: ${stats.successfulRequests}`)
  console.log(`  Failed: ${stats.failedRequests}`)
  console.log(`  Requests/sec: ${stats.requestsPerSecond.toFixed(2)}`)
  console.log(`  Avg Response Time: ${stats.avgResponseTime.toFixed(2)}ms`)
  console.log(`  Error Rate: ${((stats.failedRequests / stats.totalRequests) * 100).toFixed(2)}%`)
  
  return stats
}

/**
 * Memory usage monitor that tracks memory consumption over time
 */
export class MemoryMonitor {
  private interval: NodeJS.Timeout | null = null
  private measurements: Array<{ timestamp: number; usage: NodeJS.MemoryUsage }> = []
  
  start(intervalMs: number = 1000): void {
    this.measurements = []
    this.interval = setInterval(() => {
      this.measurements.push({
        timestamp: Date.now(),
        usage: process.memoryUsage()
      })
    }, intervalMs)
  }
  
  stop(): Array<{ timestamp: number; usage: NodeJS.MemoryUsage }> {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    return [...this.measurements]
  }
  
  getStats() {
    if (this.measurements.length === 0) return null
    
    const heapUsed = this.measurements.map(m => m.usage.heapUsed)
    const heapTotal = this.measurements.map(m => m.usage.heapTotal)
    const rss = this.measurements.map(m => m.usage.rss)
    
    return {
      heapUsed: {
        min: Math.min(...heapUsed),
        max: Math.max(...heapUsed),
        avg: heapUsed.reduce((sum, val) => sum + val, 0) / heapUsed.length
      },
      heapTotal: {
        min: Math.min(...heapTotal),
        max: Math.max(...heapTotal),
        avg: heapTotal.reduce((sum, val) => sum + val, 0) / heapTotal.length
      },
      rss: {
        min: Math.min(...rss),
        max: Math.max(...rss),
        avg: rss.reduce((sum, val) => sum + val, 0) / rss.length
      }
    }
  }
}