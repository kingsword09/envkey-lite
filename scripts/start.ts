#!/usr/bin/env node

/**
 * Application startup script
 * This script handles the complete application startup process
 */

import { serve } from '@hono/node-server'
import { DatabaseManager } from '../src/db/manager.js'
import { createApp } from '../src/index.js'
import { config } from '../src/utils/config.js'
import { initializeDatabase } from './init-db.js'
import { createAdminUser } from './create-admin.js'

async function startApplication() {
  console.log(`
🚀 Starting EnvKey Lite v${config.APP_VERSION}
   Environment: ${config.NODE_ENV}
   Host: ${config.HOST}
   Port: ${config.PORT}
   Database: ${config.DATABASE_DIR || 'In-memory'}
`)

  try {
    // Step 1: Initialize database
    console.log('📊 Initializing database...')
    await initializeDatabase()
    
    // Step 2: Create admin user if configured
    console.log('👤 Setting up admin user...')
    await createAdminUser()
    
    // Step 3: Create and configure the application
    console.log('⚙️  Creating application...')
    const dbManager = new DatabaseManager({
      dataDir: config.DATABASE_DIR
    })
    await dbManager.initialize()
    
    const app = await createApp(dbManager)
    
    // Step 4: Start the server
    console.log('🌐 Starting web server...')
    
    const server = serve({
      fetch: app.fetch,
      port: config.PORT,
      hostname: config.HOST,
    })
    
    console.log(`
✅ EnvKey Lite is running!
   
   🌐 Web Interface: http://${config.HOST}:${config.PORT}
   📊 Health Check: http://${config.HOST}:${config.PORT}${config.HEALTH_CHECK_PATH}
   📚 API Documentation: http://${config.HOST}:${config.PORT}/docs
   
   Press Ctrl+C to stop the server
`)
    
    // Handle graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`)
      
      try {
        // Close database connection
        await dbManager.close()
        console.log('✅ Database connection closed')
        
        // Close server
        server.close()
        console.log('✅ Server stopped')
        
        console.log('👋 EnvKey Lite stopped successfully')
        process.exit(0)
      } catch (error) {
        console.error('❌ Error during shutdown:', error)
        process.exit(1)
      }
    }
    
    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
    process.on('SIGINT', () => gracefulShutdown('SIGINT'))
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('💥 Uncaught Exception:', error)
      gracefulShutdown('uncaughtException')
    })
    
    process.on('unhandledRejection', (reason, promise) => {
      console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason)
      gracefulShutdown('unhandledRejection')
    })
    
  } catch (error) {
    console.error('❌ Application startup failed:', error)
    process.exit(1)
  }
}

// Run startup if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startApplication()
}

export { startApplication }