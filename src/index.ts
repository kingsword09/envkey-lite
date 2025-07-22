// Main application entry point
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { corsMiddleware, errorHandler, loggerMiddleware } from './middleware'
import { DatabaseManager } from './db/manager'
import { CryptoService } from './services/crypto.service'
import { createAuthRoutes, createProjectRoutes } from './routes'

const app = new Hono()

// Apply global middleware
app.use('*', loggerMiddleware({
  logLevel: 'info',
  logRequests: true,
  logResponses: true,
  excludePaths: ['/health']
}))

app.use('*', corsMiddleware({
  origin: process.env.CORS_ORIGIN || '*',
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

async function initializeServices() {
  // Initialize database manager
  dbManager = new DatabaseManager({
    dataDir: process.env.DB_DATA_DIR || './data'
  })
  await dbManager.initialize()
  
  // Initialize crypto service
  cryptoService = new CryptoService(dbManager)
  await cryptoService.initialize()
  
  // Mount API routes
  const jwtSecret = process.env.JWT_SECRET || 'default-jwt-secret-change-in-production'
  const authRoutes = createAuthRoutes(dbManager, cryptoService, jwtSecret)
  const projectRoutes = createProjectRoutes(dbManager, cryptoService, jwtSecret)
  
  app.route('/api/auth', authRoutes)
  app.route('/api/projects', projectRoutes)
}

export async function main(): Promise<void> {
  const port = parseInt(process.env.PORT || '3000', 10)
  const host = process.env.HOST || 'localhost'

  console.warn('🚀 envkey-lite starting...')
  
  // Initialize services
  await initializeServices()
  
  console.warn(`📡 Server will be available at http://${host}:${port}`)

  serve({
    fetch: app.fetch,
    port,
    hostname: host,
  })

  console.warn(`✅ envkey-lite is running on port ${port}`)
}

// Start the application if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.warn('🛑 Shutting down gracefully...')
  if (dbManager) {
    await dbManager.close()
  }
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.warn('🛑 Shutting down gracefully...')
  if (dbManager) {
    await dbManager.close()
  }
  process.exit(0)
})
