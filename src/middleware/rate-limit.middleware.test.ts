import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'
import request from 'supertest'
import { rateLimitMiddleware, createRateLimiter } from './rate-limit.middleware'

describe('Rate Limit Middleware', () => {
  let app: Hono

  beforeEach(() => {
    app = new Hono()
    // Clear any existing rate limit data
    vi.clearAllTimers()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Basic Rate Limiting', () => {
    it('should allow requests within rate limit', async () => {
      // Arrange
      app.use('*', rateLimitMiddleware({
        windowMs: 60000, // 1 minute
        max: 5, // 5 requests per minute
        keyGenerator: (c) => c.req.header('x-forwarded-for') || 'default'
      }))
      app.get('/test', (c) => c.json({ message: 'success' }))

      // Act & Assert
      for (let i = 0; i < 5; i++) {
        const response = await request(app.fetch)
          .get('/test')
          .set('x-forwarded-for', '127.0.0.1')
        
        expect(response.status).toBe(200)
        expect(response.body.message).toBe('success')
        expect(response.headers['x-ratelimit-limit']).toBe('5')
        expect(response.headers['x-ratelimit-remaining']).toBe(String(4 - i))
      }
    })

    it('should block requests exceeding rate limit', async () => {
      // Arrange
      app.use('*', rateLimitMiddleware({
        windowMs: 60000,
        max: 3,
        keyGenerator: (c) => c.req.header('x-forwarded-for') || 'default'
      }))
      app.get('/test', (c) => c.json({ message: 'success' }))

      // Act - Make requests up to limit
      for (let i = 0; i < 3; i++) {
        await request(app.fetch)
          .get('/test')
          .set('x-forwarded-for', '127.0.0.1')
      }

      // Act - Exceed limit
      const response = await request(app.fetch)
        .get('/test')
        .set('x-forwarded-for', '127.0.0.1')

      // Assert
      expect(response.status).toBe(429)
      expect(response.body.error.code).toBe('RATE_001')
      expect(response.headers['x-ratelimit-limit']).toBe('3')
      expect(response.headers['x-ratelimit-remaining']).toBe('0')
      expect(response.headers['retry-after']).toBeDefined()
    })

    it('should reset rate limit after window expires', async () => {
      // Arrange
      app.use('*', rateLimitMiddleware({
        windowMs: 60000, // 1 minute
        max: 2,
        keyGenerator: (c) => c.req.header('x-forwarded-for') || 'default'
      }))
      app.get('/test', (c) => c.json({ message: 'success' }))

      // Act - Exhaust rate limit
      await request(app.fetch).get('/test').set('x-forwarded-for', '127.0.0.1')
      await request(app.fetch).get('/test').set('x-forwarded-for', '127.0.0.1')
      
      let response = await request(app.fetch).get('/test').set('x-forwarded-for', '127.0.0.1')
      expect(response.status).toBe(429)

      // Act - Advance time past window
      vi.advanceTimersByTime(61000) // 61 seconds

      // Act - Try again after window reset
      response = await request(app.fetch).get('/test').set('x-forwarded-for', '127.0.0.1')

      // Assert
      expect(response.status).toBe(200)
      expect(response.headers['x-ratelimit-remaining']).toBe('1')
    })
  })

  describe('Key Generation', () => {
    it('should use IP address as default key', async () => {
      // Arrange
      app.use('*', rateLimitMiddleware({
        windowMs: 60000,
        max: 2
      }))
      app.get('/test', (c) => c.json({ message: 'success' }))

      // Act - Different IPs should have separate limits
      await request(app.fetch).get('/test').set('x-forwarded-for', '127.0.0.1')
      await request(app.fetch).get('/test').set('x-forwarded-for', '127.0.0.1')
      
      const ip1Response = await request(app.fetch).get('/test').set('x-forwarded-for', '127.0.0.1')
      const ip2Response = await request(app.fetch).get('/test').set('x-forwarded-for', '192.168.1.1')

      // Assert
      expect(ip1Response.status).toBe(429) // First IP exceeded limit
      expect(ip2Response.status).toBe(200) // Second IP has separate limit
    })

    it('should use custom key generator', async () => {
      // Arrange
      app.use('*', rateLimitMiddleware({
        windowMs: 60000,
        max: 2,
        keyGenerator: (c) => c.req.header('user-id') || 'anonymous'
      }))
      app.get('/test', (c) => c.json({ message: 'success' }))

      // Act - Same user ID should share limit
      await request(app.fetch).get('/test').set('user-id', 'user123')
      await request(app.fetch).get('/test').set('user-id', 'user123')
      
      const sameUserResponse = await request(app.fetch).get('/test').set('user-id', 'user123')
      const differentUserResponse = await request(app.fetch).get('/test').set('user-id', 'user456')

      // Assert
      expect(sameUserResponse.status).toBe(429)
      expect(differentUserResponse.status).toBe(200)
    })
  })

  describe('Skip Function', () => {
    it('should skip rate limiting when skip function returns true', async () => {
      // Arrange
      app.use('*', rateLimitMiddleware({
        windowMs: 60000,
        max: 1,
        skip: (c) => c.req.header('skip-rate-limit') === 'true'
      }))
      app.get('/test', (c) => c.json({ message: 'success' }))

      // Act - Make multiple requests with skip header
      const response1 = await request(app.fetch)
        .get('/test')
        .set('skip-rate-limit', 'true')
      
      const response2 = await request(app.fetch)
        .get('/test')
        .set('skip-rate-limit', 'true')

      // Assert
      expect(response1.status).toBe(200)
      expect(response2.status).toBe(200)
    })

    it('should apply rate limiting when skip function returns false', async () => {
      // Arrange
      app.use('*', rateLimitMiddleware({
        windowMs: 60000,
        max: 1,
        skip: (c) => c.req.header('skip-rate-limit') === 'true'
      }))
      app.get('/test', (c) => c.json({ message: 'success' }))

      // Act
      await request(app.fetch).get('/test') // First request
      const response = await request(app.fetch).get('/test') // Second request

      // Assert
      expect(response.status).toBe(429)
    })
  })

  describe('Custom Message and Status Code', () => {
    it('should use custom error message', async () => {
      // Arrange
      const customMessage = 'Too many requests, please slow down!'
      app.use('*', rateLimitMiddleware({
        windowMs: 60000,
        max: 1,
        message: customMessage
      }))
      app.get('/test', (c) => c.json({ message: 'success' }))

      // Act
      await request(app.fetch).get('/test')
      const response = await request(app.fetch).get('/test')

      // Assert
      expect(response.status).toBe(429)
      expect(response.body.error.message).toBe(customMessage)
    })

    it('should use custom status code', async () => {
      // Arrange
      app.use('*', rateLimitMiddleware({
        windowMs: 60000,
        max: 1,
        statusCode: 503
      }))
      app.get('/test', (c) => c.json({ message: 'success' }))

      // Act
      await request(app.fetch).get('/test')
      const response = await request(app.fetch).get('/test')

      // Assert
      expect(response.status).toBe(503)
    })
  })

  describe('Headers', () => {
    it('should include rate limit headers', async () => {
      // Arrange
      app.use('*', rateLimitMiddleware({
        windowMs: 60000,
        max: 5
      }))
      app.get('/test', (c) => c.json({ message: 'success' }))

      // Act
      const response = await request(app.fetch).get('/test')

      // Assert
      expect(response.headers['x-ratelimit-limit']).toBe('5')
      expect(response.headers['x-ratelimit-remaining']).toBe('4')
      expect(response.headers['x-ratelimit-reset']).toBeDefined()
    })

    it('should include retry-after header when rate limited', async () => {
      // Arrange
      app.use('*', rateLimitMiddleware({
        windowMs: 60000,
        max: 1
      }))
      app.get('/test', (c) => c.json({ message: 'success' }))

      // Act
      await request(app.fetch).get('/test')
      const response = await request(app.fetch).get('/test')

      // Assert
      expect(response.status).toBe(429)
      expect(response.headers['retry-after']).toBeDefined()
      expect(parseInt(response.headers['retry-after'])).toBeGreaterThan(0)
    })
  })

  describe('Rate Limiter Factory', () => {
    it('should create rate limiter with default options', () => {
      // Act
      const rateLimiter = createRateLimiter()

      // Assert
      expect(rateLimiter).toBeDefined()
      expect(typeof rateLimiter).toBe('function')
    })

    it('should create rate limiter with custom options', () => {
      // Act
      const rateLimiter = createRateLimiter({
        windowMs: 30000,
        max: 10,
        message: 'Custom rate limit message'
      })

      // Assert
      expect(rateLimiter).toBeDefined()
      expect(typeof rateLimiter).toBe('function')
    })
  })

  describe('Multiple Rate Limiters', () => {
    it('should handle multiple rate limiters independently', async () => {
      // Arrange
      const strictLimiter = rateLimitMiddleware({
        windowMs: 60000,
        max: 1,
        keyGenerator: (c) => `strict:${c.req.header('x-forwarded-for') || 'default'}`
      })
      
      const lenientLimiter = rateLimitMiddleware({
        windowMs: 60000,
        max: 5,
        keyGenerator: (c) => `lenient:${c.req.header('x-forwarded-for') || 'default'}`
      })

      app.use('/strict/*', strictLimiter)
      app.use('/lenient/*', lenientLimiter)
      app.get('/strict/test', (c) => c.json({ message: 'strict' }))
      app.get('/lenient/test', (c) => c.json({ message: 'lenient' }))

      // Act
      const strictResponse1 = await request(app.fetch).get('/strict/test')
      const strictResponse2 = await request(app.fetch).get('/strict/test')
      
      const lenientResponse1 = await request(app.fetch).get('/lenient/test')
      const lenientResponse2 = await request(app.fetch).get('/lenient/test')

      // Assert
      expect(strictResponse1.status).toBe(200)
      expect(strictResponse2.status).toBe(429)
      expect(lenientResponse1.status).toBe(200)
      expect(lenientResponse2.status).toBe(200)
    })
  })

  describe('Memory Management', () => {
    it('should clean up expired entries', async () => {
      // Arrange
      app.use('*', rateLimitMiddleware({
        windowMs: 1000, // 1 second
        max: 1
      }))
      app.get('/test', (c) => c.json({ message: 'success' }))

      // Act - Make request to create entry
      await request(app.fetch).get('/test').set('x-forwarded-for', '127.0.0.1')
      
      // Advance time to expire the entry
      vi.advanceTimersByTime(2000)
      
      // Make another request (should succeed as old entry is cleaned up)
      const response = await request(app.fetch).get('/test').set('x-forwarded-for', '127.0.0.1')

      // Assert
      expect(response.status).toBe(200)
      expect(response.headers['x-ratelimit-remaining']).toBe('0')
    })
  })

  describe('Edge Cases', () => {
    it('should handle missing IP address gracefully', async () => {
      // Arrange
      app.use('*', rateLimitMiddleware({
        windowMs: 60000,
        max: 1
      }))
      app.get('/test', (c) => c.json({ message: 'success' }))

      // Act - Request without IP headers
      const response = await request(app.fetch).get('/test')

      // Assert
      expect(response.status).toBe(200)
    })

    it('should handle zero max requests', async () => {
      // Arrange
      app.use('*', rateLimitMiddleware({
        windowMs: 60000,
        max: 0
      }))
      app.get('/test', (c) => c.json({ message: 'success' }))

      // Act
      const response = await request(app.fetch).get('/test')

      // Assert
      expect(response.status).toBe(429)
    })

    it('should handle negative window time', async () => {
      // Arrange
      app.use('*', rateLimitMiddleware({
        windowMs: -1000,
        max: 5
      }))
      app.get('/test', (c) => c.json({ message: 'success' }))

      // Act
      const response = await request(app.fetch).get('/test')

      // Assert
      expect(response.status).toBe(200)
    })
  })
})