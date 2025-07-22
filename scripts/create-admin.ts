#!/usr/bin/env node

/**
 * Admin user creation script
 * This script creates the default admin user if configured
 */

import { DatabaseManager } from '../src/db/manager.js'
import { UserService } from '../src/services/user.service.js'
import { CryptoService } from '../src/services/crypto.service.js'
import { config } from '../src/utils/config.js'

async function createAdminUser() {
  console.log('👤 Creating admin user...')
  
  // Check if admin configuration is provided
  if (!config.ADMIN_EMAIL || !config.ADMIN_PASSWORD) {
    console.log('ℹ️  Admin user configuration not provided, skipping admin creation')
    console.log('   Set ADMIN_EMAIL and ADMIN_PASSWORD environment variables to create admin user')
    return
  }
  
  try {
    // Initialize services
    const dbManager = new DatabaseManager({
      dataDir: config.DATABASE_DIR
    })
    await dbManager.initialize()
    
    const cryptoService = new CryptoService(config.ENCRYPTION_KEY)
    const userService = new UserService(dbManager, cryptoService)
    
    // Check if admin user already exists
    const existingAdmin = await userService.getUserByEmail(config.ADMIN_EMAIL)
    if (existingAdmin) {
      console.log(`ℹ️  Admin user already exists: ${config.ADMIN_EMAIL}`)
      await dbManager.close()
      return
    }
    
    // Create admin user
    const adminUser = await userService.createUser({
      email: config.ADMIN_EMAIL,
      password: config.ADMIN_PASSWORD,
      name: config.ADMIN_NAME,
      role: 'admin'
    })
    
    console.log('✅ Admin user created successfully!')
    console.log(`   Email: ${adminUser.email}`)
    console.log(`   Name: ${adminUser.name}`)
    console.log(`   Role: ${adminUser.role}`)
    console.log(`   ID: ${adminUser.id}`)
    
    // Close database connection
    await dbManager.close()
    
  } catch (error) {
    console.error('❌ Admin user creation failed:', error)
    process.exit(1)
  }
}

// Run admin creation if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createAdminUser()
}

export { createAdminUser }