import type { MiddlewareHandler, Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getCurrentUser } from './auth.middleware'

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  // Maximum number of requests allowed
  max: number
  // Time window in milliseconds
  windowMs: number
  // Custom message when rate limit is exceeded
  message?: string
  // Skip rate limiting for certain paths
  skipPaths?: string[]
  // Skip rate limiting based on custom logic
  skip?: (c: Context) => boolean
  // Custom key generator for rate limiting
  keyGenerator?: (c: Context) => string
  // Store for rate limit data (default: in-memory)
  store?: RateLimitStore
  // Headers to include in response
  standardHeaders?: boolean
  // Legacy headers (X-RateLimit-*)
  legacyHeaders?: boolean
}

/**
 * Rate limit store interface
 */
export interface RateLimitStore {
  get(key: string): Promise<RateLimitData | null>
  set(key: string, data: RateLimitData, ttl: number): Promise<void>
  increment(key: string, ttl: number): Promise<RateLimitData>
  reset(key: string): Promise<void>
}

/**
 * Rate limit data structure
 */
export interface RateLimitData {
  count: number
  resetTime: number
  firstRequest: number
}

/**
 * In-memory rate limit store implementation
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, RateLimitData>()
  private timers = new Map<string, NodeJS.Timeout>()

  async get(key: string): Promise<RateLimitData | null> {
    return this.store.get(key) || null
  }

  async set(key: string, data: RateLimitData, ttl: number): Promise<void> {
    this.store.set(key, data)
    this.setExpiration(key, ttl)
  }

  async increment(key: string, ttl: number): Promise<RateLimitData> {
    const now = Date.now()
    const existing = this.store.get(key)

    if (!existing || now > existing.resetTime) {
      // Create new entry or reset expired entry
      const data: RateLimitData = {
        count: 1,
        resetTime: now + ttl,
        firstRequest: now
      }
      this.store.set(key, data)
      this.setExpiration(key, ttl)
      return data
    }

    // Increment existing entry
    existing.count++
    this.store.set(key, existing)
    return existing
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key)
    const timer = this.timers.get(key)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(key)
    }
  }

  private setExpiration(key: string, ttl: number): void {
    // Clear existing timer
    const existingTimer = this.timers.get(key)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.store.delete(key)
      this.timers.delete(key)
    }, ttl)
    
    this.timers.set(key, timer)
  }

  // Cleanup method for testing
  clear(): void {
    this.store.clear()
    this.timers.forEach(timer => clearTimeout(timer))
    this.timers.clear()
  }
}

/**
 * Default key generator based on IP address
 */
function defaultKeyGenerator(c: Context): string {
  // Try to get real IP from various headers
  const forwarded = c.req.header('x-forwarded-for')
  const realIp = c.req.header('x-real-ip')
  const cfConnectingIp = c.req.header('cf-connecting-ip')
  
  // Use the first available IP
  const ip = forwarded?.split(',')[0]?.trim() || 
            realIp || 
            cfConnectingIp || 
            c.env?.ip || 
            'unknown'
  
  return `ip:${ip}`
}

/**
 * User-based key generator
 */
function userKeyGenerator(c: Context): string {
  const user = getCurrentUser(c)
  if (user) {
    return `user:${user.id}`
  }
  // Fall back to IP-based limiting for unauthenticated requests
  return defaultKeyGenerator(c)
}

/**
 * Create rate limiting middleware
 */
export function createRateLimitMiddleware(config: RateLimitConfig): MiddlewareHandler {
  const store = config.store || new MemoryRateLimitStore()
  const keyGenerator = config.keyGenerator || defaultKeyGenerator
  const message = config.message || 'Too many requests, please try again later'

  return async (c: Context, next) => {
    // Skip rate limiting for certain paths
    if (config.skipPaths?.some(path => c.req.path.startsWith(path))) {
      await next()
      return
    }

    // Skip rate limiting based on custom logic
    if (config.skip?.(c)) {
      await next()
      return
    }

    try {
      const key = keyGenerator(c)
      const data = await store.increment(key, config.windowMs)

      // Set rate limit headers
      if (config.standardHeaders !== false) {
        c.header('RateLimit-Limit', config.max.toString())
        c.header('RateLimit-Remaining', Math.max(0, config.max - data.count).toString())
        c.header('RateLimit-Reset', Math.ceil(data.resetTime / 1000).toString())
      }

      if (config.legacyHeaders) {
        c.header('X-RateLimit-Limit', config.max.toString())
        c.header('X-RateLimit-Remaining', Math.max(0, config.max - data.count).toString())
        c.header('X-RateLimit-Reset', Math.ceil(data.resetTime / 1000).toString())
      }

      // Check if rate limit is exceeded
      if (data.count > config.max) {
        c.header('Retry-After', Math.ceil((data.resetTime - Date.now()) / 1000).toString())
        
        throw new HTTPException(429, {
          message,
          cause: {
            limit: config.max,
            remaining: 0,
            reset: Math.ceil(data.resetTime / 1000),
            retryAfter: Math.ceil((data.resetTime - Date.now()) / 1000)
          }
        })
      }

      await next()
    } catch (error) {
      // Re-throw HTTPExceptions
      if (error instanceof HTTPException) {
        throw error
      }

      // Handle other errors
      console.error('Rate limiting error:', error)
      // Continue without rate limiting on store errors
      await next()
    }
  }
}

/**
 * Create IP-based rate limiting middleware
 */
export function createIPRateLimitMiddleware(
  max: number,
  windowMs: number,
  options?: Partial<RateLimitConfig>
): MiddlewareHandler {
  return createRateLimitMiddleware({
    max,
    windowMs,
    keyGenerator: defaultKeyGenerator,
    ...options
  })
}

/**
 * Create user-based rate limiting middleware
 */
export function createUserRateLimitMiddleware(
  max: number,
  windowMs: number,
  options?: Partial<RateLimitConfig>
): MiddlewareHandler {
  return createRateLimitMiddleware({
    max,
    windowMs,
    keyGenerator: userKeyGenerator,
    ...options
  })
}

/**
 * Create combined rate limiting middleware with different limits for authenticated and unauthenticated users
 */
export function createTieredRateLimitMiddleware(
  authenticatedMax: number,
  unauthenticatedMax: number,
  windowMs: number,
  options?: Partial<RateLimitConfig>
): MiddlewareHandler {
  return createRateLimitMiddleware({
    max: authenticatedMax, // This will be overridden by the custom logic
    windowMs,
    keyGenerator: (c: Context) => {
      const user = getCurrentUser(c)
      if (user) {
        return `user:${user.id}`
      }
      return defaultKeyGenerator(c)
    },
    ...options,
    // Override the middleware to handle different limits
  })
}

/**
 * Predefined rate limit configurations
 */
export const RateLimitPresets = {
  // Very strict rate limiting for sensitive operations
  STRICT: {
    max: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    message: 'Too many requests for this sensitive operation'
  },
  
  // Standard rate limiting for API endpoints
  STANDARD: {
    max: 100,
    windowMs: 15 * 60 * 1000, // 15 minutes
    message: 'Too many requests, please try again later'
  },
  
  // Lenient rate limiting for general use
  LENIENT: {
    max: 1000,
    windowMs: 15 * 60 * 1000, // 15 minutes
    message: 'Rate limit exceeded'
  },
  
  // Authentication-specific rate limiting
  AUTH: {
    max: 10,
    windowMs: 15 * 60 * 1000, // 15 minutes
    message: 'Too many authentication attempts'
  },
  
  // API key generation rate limiting
  API_KEY_GENERATION: {
    max: 3,
    windowMs: 60 * 60 * 1000, // 1 hour
    message: 'Too many API key generation requests'
  }
} as const

/**
 * Create rate limiting middleware with preset configuration
 */
export function createPresetRateLimitMiddleware(
  preset: keyof typeof RateLimitPresets,
  overrides?: Partial<RateLimitConfig>
): MiddlewareHandler {
  const config = { ...RateLimitPresets[preset], ...overrides }
  return createRateLimitMiddleware(config)
}

// Export commonly used middleware instances
export const strictRateLimit = createPresetRateLimitMiddleware('STRICT')
export const standardRateLimit = createPresetRateLimitMiddleware('STANDARD')
export const lenientRateLimit = createPresetRateLimitMiddleware('LENIENT')
export const authRateLimit = createPresetRateLimitMiddleware('AUTH')
export const apiKeyRateLimit = createPresetRateLimitMiddleware('API_KEY_GENERATION')