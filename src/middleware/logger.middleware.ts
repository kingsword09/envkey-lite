// Request logging middleware
import type { MiddlewareHandler } from 'hono'

export interface LoggerOptions {
  logLevel?: 'debug' | 'info' | 'warn' | 'error'
  logRequests?: boolean
  logResponses?: boolean
  logHeaders?: boolean
  excludePaths?: string[]
}

export const loggerMiddleware = (options: LoggerOptions = {}): MiddlewareHandler => {
  const {
    logLevel: _logLevel = 'info',
    logRequests = true,
    logResponses = true,
    logHeaders = false,
    excludePaths = ['/health']
  } = options

  return async (c, next) => {
    const start = Date.now()
    const requestId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    
    // Set request ID for error handling
    c.set('requestId', requestId)
    
    const method = c.req.method
    const path = c.req.path
    const userAgent = c.req.header('User-Agent') || 'Unknown'
    const ip = c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP') || 'Unknown'
    
    // Skip logging for excluded paths
    if (excludePaths.includes(path)) {
      await next()
      return
    }
    
    // Log incoming request
    if (logRequests) {
      const requestLog = {
        requestId,
        method,
        path,
        ip,
        userAgent,
        timestamp: new Date().toISOString(),
        ...(logHeaders && { headers: Object.fromEntries(c.req.raw.headers.entries()) })
      }
      
      console.warn(`[${requestId}] → ${method} ${path}`, requestLog)
    }
    
    await next()
    
    const duration = Date.now() - start
    const status = c.res.status
    
    // Log response
    if (logResponses) {
      const responseLog = {
        requestId,
        method,
        path,
        status,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      }
      
      const logLevel = status >= 500 ? 'error' : 
                     status >= 400 ? 'warn' : 
                     'info'
      
      const logMessage = `[${requestId}] ← ${method} ${path} ${status} (${duration}ms)`
      
      switch (logLevel) {
        case 'error':
          console.error(logMessage, responseLog)
          break
        case 'warn':
          console.warn(logMessage, responseLog)
          break
        default:
          console.warn(logMessage, responseLog)
      }
    }
  }
}