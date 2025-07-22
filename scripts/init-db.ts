#!/usr/bin/env node

/**
 * Database initialization script
 * This script initializes the database schema and creates necessary tables
 */

import { DatabaseManager } from '../src/db/manager.js'
import { config } from '../src/utils/config.js'

async function initializeDatabase() {
  console.log('🚀 Initializing EnvKey Lite database...')
  
  try {
    // Create database manager instance
    const dbManager = new DatabaseManager({
      dataDir: config.DATABASE_DIR
    })
    
    // Initialize database and run migrations
    await dbManager.initialize()
    
    console.log('✅ Database initialized successfully!')
    console.log(`   Database location: ${config.DATABASE_DIR || 'In-memory'}`)
    
    // Close database connection
    await dbManager.close()
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error)
    process.exit(1)
  }
}

// Run initialization if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeDatabase()
}

export { initializeDatabase }