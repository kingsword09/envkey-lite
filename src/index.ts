// Main application entry point
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { corsMiddleware, errorHandler, loggerMiddleware, securityHeaders, httpsRedirect, validateSecurityConfig } from './middleware'
import { DatabaseManager } from './db/manager'
import { CryptoService } from './services/crypto.service'
import { createAuthRoutes, createProjectRoutes } from './routes'
import { createDocsRoutes } from './routes/docs.routes'
import { config } from './utils/config'
import { createServers, startServers, validateHttpsConfig, type ServerConfig } from './utils/https-server'

const app = new Hono()

// Apply global middleware
app.use('*', loggerMiddleware({
  logLevel: 'info',
  logRequests: true,
  logResponses: true,
  excludePaths: ['/health']
}))

// HTTPS redirect middleware (if enabled)
if (config.FORCE_HTTPS) {
  app.use('*', httpsRedirect({
    enabled: config.HTTPS_ENABLED && config.FORCE_HTTPS,
    trustProxy: true
  }))
}

// Security headers middleware
if (config.SECURITY_HEADERS_ENABLED) {
  app.use('*', securityHeaders({
    contentSecurityPolicy: config.CSP_ENABLED ? [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ') : false,
    strictTransportSecurity: config.HSTS_ENABLED && config.NODE_ENV === 'production' ? {
      maxAge: config.HSTS_MAX_AGE,
      includeSubDomains: true,
      preload: true
    } : false,
    frameOptions: config.FRAME_OPTIONS
  }))
}

app.use('*', corsMiddleware({
  origin: config.CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}))

// Set up error handler
app.onError(errorHandler)

// Serve static files
app.use('/*', serveStatic({ root: './public' }))

// Basic health check endpoint for Docker and monitoring
app.get('/health', c => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  })
})

// API info endpoint
app.get('/api', c => {
  return c.json({
    name: 'EnvKey Lite API',
    version: process.env.npm_package_version || '1.0.0',
    description: 'A lightweight environment variable management system',
  })
})

// Initialize services and routes
let dbManager: DatabaseManager
let cryptoService: CryptoService
let serverConfig: ServerConfig

async function initializeServices() {
  // Validate security configuration
  const securityValidation = validateSecurityConfig()
  if (!securityValidation.isValid) {
    console.error('Security configuration validation failed:')
    securityValidation.errors.forEach(error => console.error(`  ❌ ${error}`))
    process.exit(1)
  }
  
  if (securityValidation.warnings.length > 0) {
    console.warn('Security configuration warnings:')
    securityValidation.warnings.forEach(warning => console.warn(`  ⚠️  ${warning}`))
  }
  
  // Validate HTTPS configuration
  const httpsValidation = validateHttpsConfig()
  if (!httpsValidation.isValid) {
    console.error('HTTPS configuration validation failed:')
    httpsValidation.errors.forEach(error => console.error(`  ❌ ${error}`))
    process.exit(1)
  }
  
  if (httpsValidation.warnings.length > 0) {
    console.warn('HTTPS configuration warnings:')
    httpsValidation.warnings.forEach(warning => console.warn(`  ⚠️  ${warning}`))
  }
  
  // Initialize database manager
  dbManager = new DatabaseManager({
    dataDir: config.DATABASE_DIR || './data'
  })
  await dbManager.initialize()
  
  // Initialize crypto service
  cryptoService = new CryptoService(dbManager)
  await cryptoService.initialize()
  
  // Mount API routes
  const authRoutes = createAuthRoutes(dbManager, cryptoService, config.JWT_SECRET)
  const projectRoutes = createProjectRoutes(dbManager, cryptoService, config.JWT_SECRET)
  const docsRoutes = createDocsRoutes()
  
  app.route('/api/auth', authRoutes)
  app.route('/api/projects', projectRoutes)
  app.route('/docs', docsRoutes)
}

export async function main(): Promise<void> {
  console.warn('🚀 envkey-lite starting...')
  
  // Initialize services
  await initializeServices()
  
  // Create and configure servers
  if (config.HTTPS_ENABLED && config.SSL_CERT_PATH && config.SSL_KEY_PATH) {
    serverConfig = createServers(app.fetch, {
      port: config.PORT,
      hostname: config.HOST,
      httpsPort: config.HTTPS_PORT,
      enableHttps: true,
      sslCertPath: config.SSL_CERT_PATH,
      sslKeyPath: config.SSL_KEY_PATH,
      forceHttps: config.FORCE_HTTPS
    })
  } else {
    // Use the simple Hono serve for HTTP only
    serve({
      fetch: app.fetch,
      port: config.PORT,
      hostname: config.HOST,
    })
    console.warn(`✅ envkey-lite is running on http://${config.HOST}:${config.PORT}`)
    return
  }
  
  // Start servers
  await startServers(serverConfig)
  
  console.warn(`✅ envkey-lite is running`)
  if (config.HTTPS_ENABLED) {
    console.warn(`🔒 HTTPS: https://${config.HOST}:${config.HTTPS_PORT}`)
  }
  console.warn(`🌐 HTTP: http://${config.HOST}:${config.PORT}`)
}

// Start the application if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.warn('🛑 Shutting down gracefully...')
  if (serverConfig) {
    const { stopServers } = await import('./utils/https-server')
    await stopServers(serverConfig)
  }
  if (dbManager) {
    await dbManager.close()
  }
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.warn('🛑 Shutting down gracefully...')
  if (serverConfig) {
    const { stopServers } = await import('./utils/https-server')
    await stopServers(serverConfig)
  }
  if (dbManager) {
    await dbManager.close()
  }
  process.exit(0)
})
