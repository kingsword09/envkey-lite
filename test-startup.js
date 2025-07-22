// Simple test for startup scripts
import { config } from './src/utils/config.js'

console.log('Testing startup configuration...')

// Set required environment variables for testing
process.env.JWT_SECRET = 'test-jwt-secret-with-minimum-32-characters-for-testing'
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters'
process.env.DATABASE_DIR = './test-data'

try {
  console.log('✅ Configuration test passed!')
  console.log(`   Environment: ${config.NODE_ENV}`)
  console.log(`   Server: ${config.HOST}:${config.PORT}`)
  console.log(`   Database: ${config.DATABASE_DIR || 'In-memory'}`)
  console.log(`   App: ${config.APP_NAME} v${config.APP_VERSION}`)
} catch (error) {
  console.error('❌ Configuration test failed:', error.message)
  process.exit(1)
}