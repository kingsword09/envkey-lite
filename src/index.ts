// Main application entry point
import { Hono } from 'hono'
import { serve } from '@hono/node-server'

const app = new Hono()

// Basic health check endpoint for Docker and monitoring
app.get('/health', c => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  })
})

// Basic info endpoint
app.get('/', c => {
  return c.json({
    name: 'EnvKey Lite',
    version: process.env.npm_package_version || '1.0.0',
    description: 'A lightweight environment variable management system',
  })
})

export async function main(): Promise<void> {
  const port = parseInt(process.env.PORT || '3000', 10)
  const host = process.env.HOST || 'localhost'

  console.warn('🚀 envkey-lite starting...')
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
