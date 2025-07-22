#!/usr/bin/env node

/**
 * System management CLI
 * Provides utilities for managing the EnvKey Lite system
 */

import { DatabaseManager } from '../src/db/manager.js'
import { UserService } from '../src/services/user.service.js'
import { CryptoService } from '../src/services/crypto.service.js'
import { HealthMonitor } from '../src/utils/health.js'
import { config } from '../src/utils/config.js'
import { initializeDatabase } from './init-db.js'
import { createAdminUser } from './create-admin.js'

// CLI commands
const commands = {
  init: initCommand,
  'create-admin': createAdminCommand,
  status: statusCommand,
  health: healthCommand,
  'reset-db': resetDbCommand,
  'list-users': listUsersCommand,
  help: helpCommand
}

// Main CLI entry point
async function main() {
  const args = process.argv.slice(2)
  const command = args[0] || 'help'
  
  if (command in commands) {
    try {
      await commands[command as keyof typeof commands](args.slice(1))
    } catch (error) {
      console.error(`❌ Command failed:`, error)
      process.exit(1)
    }
  } else {
    console.error(`Unknown command: ${command}`)
    helpCommand([])
    process.exit(1)
  }
}

// Initialize database
async function initCommand(args: string[]) {
  console.log('🚀 Initializing EnvKey Lite...')
  await initializeDatabase()
  
  if (args.includes('--with-admin')) {
    await createAdminUser()
  }
  
  console.log('✅ Initialization complete!')
}

// Create admin user
async function createAdminCommand(args: string[]) {
  await createAdminUser()
}

// Show system status
async function statusCommand(args: string[]) {
  console.log('📊 EnvKey Lite System Status\n')
  
  try {
    const dbManager = new DatabaseManager({
      dataDir: config.DATABASE_DIR
    })
    await dbManager.initialize()
    
    const healthMonitor = new HealthMonitor(dbManager)
    const systemInfo = healthMonitor.getSystemInfo()
    
    console.log('🖥️  System Information:')
    console.log(`   Node.js: ${systemInfo.node.version}`)
    console.log(`   Platform: ${systemInfo.node.platform} (${systemInfo.node.arch})`)
    console.log(`   App: ${systemInfo.app.name} v${systemInfo.app.version}`)
    console.log(`   Environment: ${systemInfo.app.environment}`)
    console.log(`   Uptime: ${Math.round(systemInfo.app.uptime / 1000)}s`)
    
    console.log('\n⚙️  Configuration:')
    console.log(`   Host: ${systemInfo.config.host}:${systemInfo.config.port}`)
    console.log(`   Database: ${systemInfo.config.database}`)
    console.log(`   Log Level: ${systemInfo.config.logLevel}`)
    
    // Show user count
    const cryptoService = new CryptoService(config.ENCRYPTION_KEY)
    const userService = new UserService(dbManager, cryptoService)
    const users = await userService.listUsers()
    
    console.log('\n👥 Users:')
    console.log(`   Total users: ${users.length}`)
    console.log(`   Admin users: ${users.filter(u => u.role === 'admin').length}`)
    
    await dbManager.close()
    
  } catch (error) {
    console.error('❌ Failed to get system status:', error)
    process.exit(1)
  }
}

// Show health check
async function healthCommand(args: string[]) {
  console.log('🏥 EnvKey Lite Health Check\n')
  
  try {
    const dbManager = new DatabaseManager({
      dataDir: config.DATABASE_DIR
    })
    await dbManager.initialize()
    
    const healthMonitor = new HealthMonitor(dbManager)
    const health = await healthMonitor.checkHealth()
    
    // Show overall status
    const statusIcon = health.status === 'healthy' ? '✅' : 
                      health.status === 'degraded' ? '⚠️' : '❌'
    
    console.log(`${statusIcon} Overall Status: ${health.status.toUpperCase()}`)
    console.log(`   Timestamp: ${health.timestamp}`)
    console.log(`   Uptime: ${Math.round(health.uptime / 1000)}s`)
    
    // Show individual checks
    console.log('\n🔍 Health Checks:')
    
    for (const [name, check] of Object.entries(health.checks)) {
      const checkIcon = check.status === 'pass' ? '✅' : 
                       check.status === 'warn' ? '⚠️' : '❌'
      
      console.log(`   ${checkIcon} ${name}: ${check.message}`)
      
      if (check.responseTime) {
        console.log(`      Response time: ${check.responseTime}ms`)
      }
      
      if (check.details) {
        for (const [key, value] of Object.entries(check.details)) {
          console.log(`      ${key}: ${value}`)
        }
      }
    }
    
    await dbManager.close()
    
    // Exit with error code if unhealthy
    if (health.status === 'unhealthy') {
      process.exit(1)
    }
    
  } catch (error) {
    console.error('❌ Health check failed:', error)
    process.exit(1)
  }
}

// Reset database
async function resetDbCommand(args: string[]) {
  if (!args.includes('--confirm')) {
    console.error('⚠️  This will delete all data!')
    console.error('   Use --confirm flag to proceed: npm run manage reset-db -- --confirm')
    process.exit(1)
  }
  
  console.log('🗑️  Resetting database...')
  
  try {
    const dbManager = new DatabaseManager({
      dataDir: config.DATABASE_DIR
    })
    
    // If using file-based database, delete the directory
    if (config.DATABASE_DIR) {
      const fs = await import('fs/promises')
      const path = await import('path')
      
      const dbPath = path.resolve(config.DATABASE_DIR)
      
      try {
        await fs.rm(dbPath, { recursive: true, force: true })
        console.log(`   Deleted database directory: ${dbPath}`)
      } catch (error) {
        console.log(`   Database directory not found or already deleted`)
      }
    }
    
    // Reinitialize database
    await dbManager.initialize()
    console.log('   Database reinitialized')
    
    await dbManager.close()
    
    console.log('✅ Database reset complete!')
    console.log('   Run "npm run manage create-admin" to create a new admin user')
    
  } catch (error) {
    console.error('❌ Database reset failed:', error)
    process.exit(1)
  }
}

// List users
async function listUsersCommand(args: string[]) {
  console.log('👥 EnvKey Lite Users\n')
  
  try {
    const dbManager = new DatabaseManager({
      dataDir: config.DATABASE_DIR
    })
    await dbManager.initialize()
    
    const cryptoService = new CryptoService(config.ENCRYPTION_KEY)
    const userService = new UserService(dbManager, cryptoService)
    const users = await userService.listUsers()
    
    if (users.length === 0) {
      console.log('   No users found')
      console.log('   Run "npm run manage create-admin" to create an admin user')
    } else {
      console.log(`Found ${users.length} user(s):\n`)
      
      users.forEach((user, index) => {
        console.log(`${index + 1}. ${user.name} (${user.email})`)
        console.log(`   Role: ${user.role}`)
        console.log(`   ID: ${user.id}`)
        console.log(`   Created: ${user.createdAt.toISOString()}`)
        console.log('')
      })
    }
    
    await dbManager.close()
    
  } catch (error) {
    console.error('❌ Failed to list users:', error)
    process.exit(1)
  }
}

// Show help information
function helpCommand(args: string[]) {
  console.log(`
EnvKey Lite Management CLI

Usage: npm run manage <command> [options]

Commands:
  init [--with-admin]     Initialize database and optionally create admin user
  create-admin           Create admin user from environment configuration
  status                 Show system status and information
  health                 Run health checks and show results
  reset-db --confirm     Reset database (WARNING: deletes all data)
  list-users            List all users in the system
  help                  Show this help message

Examples:
  npm run manage init --with-admin
  npm run manage status
  npm run manage health
  npm run manage reset-db -- --confirm
  npm run manage list-users

Environment Variables:
  ADMIN_EMAIL           Email for default admin user
  ADMIN_PASSWORD        Password for default admin user
  ADMIN_NAME           Name for default admin user (default: Administrator)
  DATABASE_DIR         Database directory (leave empty for in-memory)
`)
}

// Run CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { main as runManageCli }