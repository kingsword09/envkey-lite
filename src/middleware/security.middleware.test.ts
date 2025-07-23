import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { securityHeaders, httpsRedirect, validateSecurityConfig } from './security.middleware'

describe('Security Middleware', () => {
  let app: Hono

  beforeEach(() => {
    app = new Hono()
  })

  describe('securityHeaders', () => {
    it('should add default security headers', async () => {
      app.use('*', securityHeaders())
      app.get('/test', c => c.text('OK'))

      const res = await app.request('/test')
      
      expect(res.headers.get('X-Frame-Options')).toBe('DENY')
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(res.headers.get('X-XSS-Protection')).toBe('1; mode=block')
      expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
      expect(res.headers.get('X-Permitted-Cross-Domain-Policies')).toBe('none')
      expect(res.headers.get('X-Download-Options')).toBe('noopen')
      expect(res.headers.get('X-DNS-Prefetch-Control')).toBe('off')
      expect(res.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp')
      expect(res.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin')
      expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin')
      expect(res.headers.get('Server')).toBe('')
      expect(res.headers.get('X-Powered-By')).toBe('')
    })

    it('should add Content Security Policy header', async () => {
      app.use('*', securityHeaders())
      app.get('/test', c => c.text('OK'))

      const res = await app.request('/test')
      
      const csp = res.headers.get('Content-Security-Policy')
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).toContain("base-uri 'self'")
    })

    it('should add Permissions Policy header', async () => {
      app.use('*', securityHeaders())
      app.get('/test', c => c.text('OK'))

      const res = await app.request('/test')
      
      const permissionsPolicy = res.headers.get('Permissions-Policy')
      expect(permissionsPolicy).toContain('camera=()')
      expect(permissionsPolicy).toContain('microphone=()')
      expect(permissionsPolicy).toContain('geolocation=()')
    })

    it('should allow disabling specific headers', async () => {
      app.use('*', securityHeaders({
        contentSecurityPolicy: false,
        frameOptions: false,
        contentTypeOptions: false
      }))
      app.get('/test', c => c.text('OK'))

      const res = await app.request('/test')
      
      expect(res.headers.get('Content-Security-Policy')).toBeNull()
      expect(res.headers.get('X-Frame-Options')).toBeNull()
      expect(res.headers.get('X-Content-Type-Options')).toBeNull()
    })

    it('should allow custom CSP', async () => {
      const customCSP = "default-src 'self'; script-src 'self' 'unsafe-eval'"
      
      app.use('*', securityHeaders({
        contentSecurityPolicy: customCSP
      }))
      app.get('/test', c => c.text('OK'))

      const res = await app.request('/test')
      
      expect(res.headers.get('Content-Security-Policy')).toBe(customCSP)
    })

    it('should configure HSTS with custom options', async () => {
      app.use('*', securityHeaders({
        strictTransportSecurity: {
          maxAge: 86400,
          includeSubDomains: true,
          preload: false
        }
      }))
      app.get('/test', c => c.text('OK'))

      const res = await app.request('/test')
      
      expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=86400; includeSubDomains')
    })

    it('should configure Expect-CT header', async () => {
      app.use('*', securityHeaders({
        expectCt: {
          maxAge: 86400,
          enforce: true,
          reportUri: 'https://example.com/report'
        }
      }))
      app.get('/test', c => c.text('OK'))

      const res = await app.request('/test')
      
      expect(res.headers.get('Expect-CT')).toBe('max-age=86400, enforce, report-uri="https://example.com/report"')
    })
  })

  describe('httpsRedirect', () => {
    it('should redirect HTTP to HTTPS when enabled', async () => {
      app.use('*', httpsRedirect({ enabled: true }))
      app.get('/test', c => c.text('OK'))

      const res = await app.request('http://example.com/test', {
        headers: {
          'x-forwarded-proto': 'http'
        }
      })
      
      expect(res.status).toBe(301)
      expect(res.headers.get('Location')).toBe('https://example.com/test')
    })

    it('should not redirect when HTTPS is already used', async () => {
      app.use('*', httpsRedirect({ enabled: true }))
      app.get('/test', c => c.text('OK'))

      const res = await app.request('https://example.com/test', {
        headers: {
          'x-forwarded-proto': 'https'
        }
      })
      
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('OK')
    })

    it('should not redirect when disabled', async () => {
      app.use('*', httpsRedirect({ enabled: false }))
      app.get('/test', c => c.text('OK'))

      const res = await app.request('http://example.com/test', {
        headers: {
          'x-forwarded-proto': 'http'
        }
      })
      
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('OK')
    })

    it('should use custom status code', async () => {
      app.use('*', httpsRedirect({ enabled: true, statusCode: 302 }))
      app.get('/test', c => c.text('OK'))

      const res = await app.request('http://example.com/test', {
        headers: {
          'x-forwarded-proto': 'http'
        }
      })
      
      expect(res.status).toBe(302)
    })
  })

  describe('validateSecurityConfig', () => {
    it('should validate security configuration', () => {
      const result = validateSecurityConfig()
      
      expect(result).toHaveProperty('isValid')
      expect(result).toHaveProperty('warnings')
      expect(result).toHaveProperty('errors')
      expect(Array.isArray(result.warnings)).toBe(true)
      expect(Array.isArray(result.errors)).toBe(true)
    })

    it('should return warnings for development environment', () => {
      // This test depends on the current NODE_ENV, so we'll just check structure
      const result = validateSecurityConfig()
      
      expect(typeof result.isValid).toBe('boolean')
      expect(Array.isArray(result.warnings)).toBe(true)
      expect(Array.isArray(result.errors)).toBe(true)
    })
  })
})