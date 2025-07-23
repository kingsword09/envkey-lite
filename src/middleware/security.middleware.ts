import { MiddlewareHandler } from 'hono'
import { config } from '../utils/config'

export interface SecurityHeadersOptions {
  // Content Security Policy
  contentSecurityPolicy?: string | false
  
  // X-Frame-Options
  frameOptions?: 'DENY' | 'SAMEORIGIN' | string | false
  
  // X-Content-Type-Options
  contentTypeOptions?: boolean
  
  // X-XSS-Protection
  xssProtection?: boolean
  
  // Referrer-Policy
  referrerPolicy?: string | false
  
  // Strict-Transport-Security (HSTS)
  strictTransportSecurity?: {
    maxAge: number
    includeSubDomains?: boolean
    preload?: boolean
  } | false
  
  // X-Permitted-Cross-Domain-Policies
  permittedCrossDomainPolicies?: string | false
  
  // X-Download-Options
  downloadOptions?: boolean
  
  // X-DNS-Prefetch-Control
  dnsPrefetchControl?: boolean
  
  // Expect-CT
  expectCt?: {
    maxAge: number
    enforce?: boolean
    reportUri?: string
  } | false
  
  // Feature-Policy / Permissions-Policy
  permissionsPolicy?: string | false
  
  // Cross-Origin-Embedder-Policy
  crossOriginEmbedderPolicy?: 'require-corp' | 'unsafe-none' | false
  
  // Cross-Origin-Opener-Policy
  crossOriginOpenerPolicy?: 'same-origin' | 'same-origin-allow-popups' | 'unsafe-none' | false
  
  // Cross-Origin-Resource-Policy
  crossOriginResourcePolicy?: 'same-site' | 'same-origin' | 'cross-origin' | false
}

const DEFAULT_SECURITY_OPTIONS: SecurityHeadersOptions = {
  // Default CSP - restrictive but functional for most web apps
  contentSecurityPolicy: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'", // Allow inline scripts for basic functionality
    "style-src 'self' 'unsafe-inline'", // Allow inline styles
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '),
  
  frameOptions: 'DENY',
  contentTypeOptions: true,
  xssProtection: true,
  referrerPolicy: 'strict-origin-when-cross-origin',
  
  // HSTS - only enable in production with HTTPS
  strictTransportSecurity: config.NODE_ENV === 'production' ? {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  } : false,
  
  permittedCrossDomainPolicies: 'none',
  downloadOptions: true,
  dnsPrefetchControl: true,
  
  // Expect-CT - only for production
  expectCt: config.NODE_ENV === 'production' ? {
    maxAge: 86400, // 24 hours
    enforce: true
  } : false,
  
  // Modern security headers
  permissionsPolicy: [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()'
  ].join(', '),
  
  crossOriginEmbedderPolicy: 'require-corp',
  crossOriginOpenerPolicy: 'same-origin',
  crossOriginResourcePolicy: 'same-origin'
}

/**
 * Security headers middleware
 * Adds various security-related HTTP headers to responses
 */
export function securityHeaders(options: SecurityHeadersOptions = {}): MiddlewareHandler {
  const opts = { ...DEFAULT_SECURITY_OPTIONS, ...options }
  
  return async (c, next) => {
    await next()
    
    // Content Security Policy
    if (opts.contentSecurityPolicy !== false) {
      c.header('Content-Security-Policy', opts.contentSecurityPolicy!)
    }
    
    // X-Frame-Options
    if (opts.frameOptions !== false) {
      c.header('X-Frame-Options', opts.frameOptions!)
    }
    
    // X-Content-Type-Options
    if (opts.contentTypeOptions) {
      c.header('X-Content-Type-Options', 'nosniff')
    }
    
    // X-XSS-Protection
    if (opts.xssProtection) {
      c.header('X-XSS-Protection', '1; mode=block')
    }
    
    // Referrer-Policy
    if (opts.referrerPolicy !== false) {
      c.header('Referrer-Policy', opts.referrerPolicy!)
    }
    
    // Strict-Transport-Security (HSTS)
    if (opts.strictTransportSecurity !== false) {
      const hsts = opts.strictTransportSecurity!
      let hstsValue = `max-age=${hsts.maxAge}`
      
      if (hsts.includeSubDomains) {
        hstsValue += '; includeSubDomains'
      }
      
      if (hsts.preload) {
        hstsValue += '; preload'
      }
      
      c.header('Strict-Transport-Security', hstsValue)
    }
    
    // X-Permitted-Cross-Domain-Policies
    if (opts.permittedCrossDomainPolicies !== false) {
      c.header('X-Permitted-Cross-Domain-Policies', opts.permittedCrossDomainPolicies!)
    }
    
    // X-Download-Options
    if (opts.downloadOptions) {
      c.header('X-Download-Options', 'noopen')
    }
    
    // X-DNS-Prefetch-Control
    if (opts.dnsPrefetchControl) {
      c.header('X-DNS-Prefetch-Control', 'off')
    }
    
    // Expect-CT
    if (opts.expectCt !== false) {
      const expectCt = opts.expectCt!
      let expectCtValue = `max-age=${expectCt.maxAge}`
      
      if (expectCt.enforce) {
        expectCtValue += ', enforce'
      }
      
      if (expectCt.reportUri) {
        expectCtValue += `, report-uri="${expectCt.reportUri}"`
      }
      
      c.header('Expect-CT', expectCtValue)
    }
    
    // Permissions-Policy (formerly Feature-Policy)
    if (opts.permissionsPolicy !== false) {
      c.header('Permissions-Policy', opts.permissionsPolicy!)
    }
    
    // Cross-Origin-Embedder-Policy
    if (opts.crossOriginEmbedderPolicy !== false) {
      c.header('Cross-Origin-Embedder-Policy', opts.crossOriginEmbedderPolicy!)
    }
    
    // Cross-Origin-Opener-Policy
    if (opts.crossOriginOpenerPolicy !== false) {
      c.header('Cross-Origin-Opener-Policy', opts.crossOriginOpenerPolicy!)
    }
    
    // Cross-Origin-Resource-Policy
    if (opts.crossOriginResourcePolicy !== false) {
      c.header('Cross-Origin-Resource-Policy', opts.crossOriginResourcePolicy!)
    }
    
    // Remove server information
    c.header('Server', '')
    c.header('X-Powered-By', '')
  }
}

/**
 * Validate security configuration
 */
export function validateSecurityConfig(): {
  isValid: boolean
  warnings: string[]
  errors: string[]
} {
  const warnings: string[] = []
  const errors: string[] = []
  
  // Check if running in production
  if (config.NODE_ENV === 'production') {
    // Check for HTTPS configuration
    if (!process.env.HTTPS_ENABLED && !process.env.SSL_CERT) {
      warnings.push('HTTPS is not configured for production environment')
    }
    
    // Check for secure JWT secret
    if (config.JWT_SECRET.length < 64) {
      warnings.push('JWT_SECRET should be at least 64 characters long in production')
    }
    
    // Check for secure encryption key
    if (config.ENCRYPTION_KEY.length < 32) {
      errors.push('ENCRYPTION_KEY must be at least 32 characters long')
    }
    
    // Check CORS configuration
    if (config.CORS_ORIGIN === '*') {
      warnings.push('CORS_ORIGIN is set to "*" which allows all origins. Consider restricting this in production.')
    }
  }
  
  // Check for development-specific issues
  if (config.NODE_ENV === 'development') {
    if (config.JWT_SECRET === 'default-jwt-secret-change-in-production') {
      warnings.push('Using default JWT_SECRET in development. This is fine for development but must be changed for production.')
    }
  }
  
  return {
    isValid: errors.length === 0,
    warnings,
    errors
  }
}

/**
 * HTTPS redirect middleware
 * Redirects HTTP requests to HTTPS in production
 */
export function httpsRedirect(options: {
  enabled?: boolean
  trustProxy?: boolean
  statusCode?: 301 | 302
} = {}): MiddlewareHandler {
  const opts = {
    enabled: config.NODE_ENV === 'production',
    trustProxy: true,
    statusCode: 301 as const,
    ...options
  }
  
  return async (c, next) => {
    if (!opts.enabled) {
      await next()
      return
    }
    
    const protocol = opts.trustProxy 
      ? c.req.header('x-forwarded-proto') || c.req.header('x-forwarded-protocol')
      : c.req.url.split('://')[0]
    
    if (protocol === 'http') {
      const httpsUrl = c.req.url.replace(/^http:/, 'https:')
      return c.redirect(httpsUrl, opts.statusCode)
    }
    
    await next()
  }
}