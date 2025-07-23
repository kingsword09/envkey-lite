#!/usr/bin/env node

import { writeFileSync, existsSync } from 'fs'
import { validateConfigFile, loadConfig } from './config'

// CLI commands
const commands = {
  validate: validateCommand,
  generate: generateCommand,
  check: checkCommand,
  help: helpCommand
}

// Main CLI entry point
function main(): void {
  const args = process.argv.slice(2)
  const command = args[0] || 'help'
  
  if (command in commands) {
    commands[command as keyof typeof commands](args.slice(1))
  } else {
    console.error(`Unknown command: ${command}`)
    helpCommand([])
    process.exit(1)
  }
}

// Validate configuration file
function validateCommand(args: string[]): void {
  const filePath = args[0] || '.env'
  
  console.warn(`Validating configuration file: ${filePath}`)
  
  if (!existsSync(filePath)) {
    console.error(`Configuration file not found: ${filePath}`)
    process.exit(1)
  }
  
  const isValid = validateConfigFile(filePath)
  
  if (isValid) {
    console.warn('✅ Configuration is valid')
    process.exit(0)
  } else {
    console.warn('❌ Configuration is invalid')
    process.exit(1)
  }
}

// Generate example configuration file
function generateCommand(args: string[]): void {
  const outputPath = args[0] || '.env'
  
  if (existsSync(outputPath) && !args.includes('--force')) {
    console.error(`Configuration file already exists: ${outputPath}`)
    console.error('Use --force to overwrite')
    process.exit(1)
  }
  
  const exampleConfig = `# EnvKey Lite Configuration
# Generated on ${new Date().toISOString()}

# Application Configuration
NODE_ENV=development
PORT=3000
HOST=localhost
APP_NAME=EnvKey Lite
APP_VERSION=1.0.0

# Database Configuration
# PGlite data directory (leave empty for in-memory database)
DATABASE_DIR=./data

# Security Configuration
# IMPORTANT: Generate secure keys for production!
JWT_SECRET=${generateSecureKey(64)}
ENCRYPTION_KEY=${generateSecureKey(32)}
API_KEY_PREFIX=envkey_

# CORS Configuration
CORS_ORIGIN=http://localhost:3000

# Logging Configuration
LOG_LEVEL=info

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Session Configuration
SESSION_TIMEOUT_HOURS=24

# Audit Log Configuration
AUDIT_LOG_RETENTION_DAYS=90

# Default Admin User Configuration (optional)
# ADMIN_EMAIL=admin@example.com
# ADMIN_PASSWORD=change-this-secure-password
# ADMIN_NAME=Administrator

# Health Check Configuration
HEALTH_CHECK_ENABLED=true
HEALTH_CHECK_PATH=/health
`
  
  try {
    writeFileSync(outputPath, exampleConfig)
    console.warn(`✅ Configuration file generated: ${outputPath}`)
    console.warn('⚠️  Please review and update the generated values, especially secrets!')
  } catch (error) {
    console.error(`Failed to generate configuration file: ${error}`)
    process.exit(1)
  }
}

// Check current configuration
function checkCommand(_args: string[]): void {
  try {
    console.warn('Checking current configuration...\n')
    
    const config = loadConfig()
    
    console.warn('📋 Configuration Summary:')
    console.warn(`   Environment: ${config.NODE_ENV}`)
    console.warn(`   Server: ${config.HOST}:${config.PORT}`)
    console.warn(`   Database: ${config.DATABASE_DIR ? `File-based (${config.DATABASE_DIR})` : 'In-memory'}`)
    console.warn(`   Log Level: ${config.LOG_LEVEL}`)
    console.warn(`   App Name: ${config.APP_NAME}`)
    console.warn(`   App Version: ${config.APP_VERSION}`)
    console.warn(`   API Key Prefix: ${config.API_KEY_PREFIX}`)
    console.warn(`   CORS Origin: ${config.CORS_ORIGIN}`)
    console.warn(`   Rate Limit: ${config.RATE_LIMIT_MAX_REQUESTS} requests per ${config.RATE_LIMIT_WINDOW_MS}ms`)
    console.warn(`   Session Timeout: ${config.SESSION_TIMEOUT_HOURS} hours`)
    console.warn(`   Audit Retention: ${config.AUDIT_LOG_RETENTION_DAYS} days`)
    console.warn(`   Health Check: ${config.HEALTH_CHECK_ENABLED ? 'Enabled' : 'Disabled'} (${config.HEALTH_CHECK_PATH})`)
    
    if (config.ADMIN_EMAIL) {
      console.warn(`   Admin User: ${config.ADMIN_EMAIL} (${config.ADMIN_NAME})`)
    } else {
      console.warn('   Admin User: Not configured')
    }
    
    console.warn('\n🔒 Security Check:')
    console.warn(`   JWT Secret: ${config.JWT_SECRET.length >= 32 ? '✅ Secure length' : '❌ Too short'}`)
    console.warn(`   Encryption Key: ${config.ENCRYPTION_KEY.length >= 32 ? '✅ Secure length' : '❌ Too short'}`)
    
    if (config.NODE_ENV === 'production') {
      console.warn('\n⚠️  Production Environment Warnings:')
      
      if (config.JWT_SECRET.includes('change-this') || config.JWT_SECRET.includes('example')) {
        console.warn('   - JWT_SECRET appears to be a default value')
      }
      
      if (config.ENCRYPTION_KEY.includes('change-this') || config.ENCRYPTION_KEY.includes('example')) {
        console.warn('   - ENCRYPTION_KEY appears to be a default value')
      }
      
      if (config.CORS_ORIGIN === '*') {
        console.warn('   - CORS_ORIGIN is set to wildcard (*)')
      }
      
      if (!config.DATABASE_DIR) {
        console.warn('   - Database is running in memory mode (data will be lost on restart)')
      }
    }
    
    console.warn('\n✅ Configuration check completed')
    
  } catch (error) {
    console.error('❌ Configuration check failed:', error)
    process.exit(1)
  }
}

// Show help information
function helpCommand(_args: string[]): void {
  console.warn(`
EnvKey Lite Configuration CLI

Usage: node config-cli.js <command> [options]

Commands:
  validate [file]     Validate configuration file (default: .env)
  generate [file]     Generate example configuration file (default: .env)
                      Use --force to overwrite existing file
  check              Check current configuration and show summary
  help               Show this help message

Examples:
  node config-cli.js validate .env.production
  node config-cli.js generate .env.example
  node config-cli.js generate .env --force
  node config-cli.js check
`)
}

// Generate a secure random key
function generateSecureKey(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// Run CLI if this file is executed directly
if (require.main === module) {
  main()
}

export { main as runConfigCli }