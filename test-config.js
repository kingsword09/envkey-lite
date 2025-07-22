// Simple test script for configuration
import { loadConfig } from './src/utils/config.js'

try {
  console.log('Testing configuration loading...')
  
  // Set required environment variables
  process.env.JWT_SECRET = 'test-jwt-secret-with-minimum-32-characters-for-testing'
  process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters'
  
  const config = loadConfig()
  
  console.log('✅ Configuration loaded successfully!')
  console.log('Configuration summary:')
  console.log(`  - Environment: ${config.NODE_ENV}`)
  console.log(`  - Server: ${config.HOST}:${config.PORT}`)
  console.log(`  - Database: ${config.DATABASE_DIR ? 'File-based' : 'In-memory'}`)
  console.log(`  - Log Level: ${config.LOG_LEVEL}`)
  console.log(`  - Health Check: ${config.HEALTH_CHECK_ENABLED ? 'Enabled' : 'Disabled'}`)
  
} catch (error) {
  console.error('❌ Configuration test failed:', error.message)
  process.exit(1)
}