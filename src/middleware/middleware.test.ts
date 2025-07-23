import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { corsMiddleware } from './cors.middleware'
import { errorMiddleware, ValidationError, ErrorCode } from './error.middleware'
import { loggerMiddleware } from './logger.middleware'

describe('Middleware Tests', () => {
  let app: Hono
  
  beforeEach(() => {
    app = new Hono()
    vi.clearAllMocks()
  })

  describe('CORS Middleware', () => {
    it('should set default CORS headers', async () => {
      app.use('*', corsMiddleware())
      app.get('/test', c => c.json({ message: 'test' }))

      const req = new Request('http://localhost/test', {
        method: 'GET',
        headers: { 'Origin': 'http://example.com' }
      })
      
      const res = await app.request(req)
      
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET')
      expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type')
      expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    })

    it('should handle preflight OPTIONS requests', async () => {
      app.use('*', corsMiddleware())
      
      const req = new Request('http://localhost/test', {
        method: 'OPTIONS',
        headers: { 'Origin': 'http://example.com' }
      })
      
      const res = await app.request(req)
      
      expect(res.status).toBe(204)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })

    it('should handle specific origin configuration', async () => {
      app.use('*', corsMiddleware({ origin: 'http://localhost:3000' }))
      app.get('/test', c => c.json({ message: 'test' }))

      const req = new Request('http://localhost/test', {
        method: 'GET',
        headers: { 'Origin': 'http://localhost:3000' }
      })
      
      const res = await app.request(req)
      
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000')
    })

    it('should handle array of origins', async () => {
      app.use('*', corsMiddleware({ origin: ['http://localhost:3000', 'http://example.com'] }))
      app.get('/test', c => c.json({ message: 'test' }))

      const req = new Request('http://localhost/test', {
        method: 'GET',
        headers: { 'Origin': 'http://localhost:3000' }
      })
      
      const res = await app.request(req)
      
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000')
    })
  })

  describe('Error Middleware', () => {
    it('should handle ValidationError correctly', async () => {
      app.use('*', errorMiddleware)
      app.get('/test', () => {
        throw new ValidationError(ErrorCode.INVALID_INPUT, 'Invalid input provided', { field: 'email' })
      })

      const res = await app.request('http://localhost/test')
      
      expect(res.status).toBe(400)
      
      const body = await res.json()
      expect(body.error.code).toBe(ErrorCode.INVALID_INPUT)
      expect(body.error.message).toBe('Invalid input provided')
      expect(body.error.details).toEqual({ field: 'email' })
      expect(body.error.timestamp).toBeDefined()
      expect(body.error.requestId).toBeDefined()
    })

    it('should handle generic errors as internal server error', async () => {
      app.use('*', errorMiddleware)
      app.get('/test', () => {
        throw new Error('Something went wrong')
      })

      const res = await app.request('http://localhost/test')
      
      expect(res.status).toBe(500)
      
      const body = await res.json()
      expect(body.error.code).toBe(ErrorCode.INTERNAL_ERROR)
      expect(body.error.message).toBe('Internal server error')
      expect(body.error.timestamp).toBeDefined()
      expect(body.error.requestId).toBeDefined()
    })

    it('should continue to next middleware when no error occurs', async () => {
      app.use('*', errorMiddleware)
      app.get('/test', c => c.json({ message: 'success' }))

      const res = await app.request('http://localhost/test')
      const body = await res.json()
      
      expect(res.status).toBe(200)
      expect(body.message).toBe('success')
    })
  })

  describe('Logger Middleware', () => {
    beforeEach(() => {
      vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    it('should log requests and responses', async () => {
      app.use('*', loggerMiddleware())
      app.get('/test', c => c.json({ message: 'test' }))

      await app.request('http://localhost/test')
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('→ GET /test'),
        expect.objectContaining({
          method: 'GET',
          path: '/test'
        })
      )
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('← GET /test 200'),
        expect.objectContaining({
          method: 'GET',
          path: '/test',
          status: 200
        })
      )
    })

    it('should skip excluded paths', async () => {
      app.use('*', loggerMiddleware({ excludePaths: ['/health'] }))
      app.get('/health', c => c.json({ status: 'ok' }))

      await app.request('http://localhost/health')
      
      expect(console.log).not.toHaveBeenCalled()
    })

    it('should log errors with appropriate level', async () => {
      app.use('*', loggerMiddleware())
      app.get('/test', c => c.json({ error: 'test error' }, 500))

      await app.request('http://localhost/test')
      
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('← GET /test 500'),
        expect.objectContaining({
          method: 'GET',
          path: '/test',
          status: 500
        })
      )
    })

    it('should log warnings for 4xx status codes', async () => {
      app.use('*', loggerMiddleware())
      app.get('/test', c => c.json({ error: 'not found' }, 404))

      await app.request('http://localhost/test')
      
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('← GET /test 404'),
        expect.objectContaining({
          method: 'GET',
          path: '/test',
          status: 404
        })
      )
    })
  })
})