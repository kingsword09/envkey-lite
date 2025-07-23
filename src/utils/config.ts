import { z } from 'zod'
import { readFileSync, existsSync } from 'fs'
// import { join } from 'path' // Removed unused import

// Environment configuration schema
const configSchema = z.object({
  // Server configuration
  PORT: z.string().default('3000').transform(Number),
  HOST: z.string().default('localhost'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database configuration
  DATABASE_DIR: z.string().optional(), // undefined for in-memory mode
  DATABASE_PATH: z.string().optional(), // deprecated, use DATABASE_DIR

  // Security configuration
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),
  API_KEY_PREFIX: z.string().default('envkey_'),

  // CORS configuration
  CORS_ORIGIN: z.string().default('*'),

  // HTTPS configuration
  HTTPS_ENABLED: z.string().default('false').transform(val => val === 'true'),
  SSL_CERT_PATH: z.string().optional(),
  SSL_KEY_PATH: z.string().optional(),
  HTTPS_PORT: z.string().default('3443').transform(Number),
  FORCE_HTTPS: z.string().default('false').transform(val => val === 'true'),

  // Security headers configuration
  SECURITY_HEADERS_ENABLED: z.string().default('true').transform(val => val === 'true'),
  CSP_ENABLED: z.string().default('true').transform(val => val === 'true'),
  HSTS_ENABLED: z.string().default('true').transform(val => val === 'true'),
  HSTS_MAX_AGE: z.string().default('31536000').transform(Number), // 1 year
  FRAME_OPTIONS: z.enum(['DENY', 'SAMEORIGIN']).default('DENY'),

  // Logging configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.string().default('900000').transform(Number), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100').transform(Number),

  // Session configuration
  SESSION_TIMEOUT_HOURS: z.string().default('24').transform(Number),

  // Audit log retention
  AUDIT_LOG_RETENTION_DAYS: z.string().default('90').transform(Number),

  // Admin user configuration
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  ADMIN_NAME: z.string().default('Administrator'),

  // Application configuration
  APP_NAME: z.string().default('EnvKey Lite'),
  APP_VERSION: z.string().default('1.0.0'),
  
  // Health check configuration
  HEALTH_CHECK_ENABLED: z.string().default('true').transform(val => val === 'true'),
  HEALTH_CHECK_PATH: z.string().default('/health'),
})

export type Config = z.infer<typeof configSchema>

// Configuration file paths
const CONFIG_PATHS = [
  '.env',
  '.env.local',
  'config/app.env',
  '/etc/envkey-lite/config.env'
]

// Load environment variables from file
function loadEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {}
  }

  try {
    const content = readFileSync(filePath, 'utf-8')
    const env: Record<string, string> = {}
    
    content.split('\n').forEach(line => {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=')
        if (key && valueParts.length > 0) {
          env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '')
        }
      }
    })
    
    return env
  } catch (error) {
    console.warn(`Failed to load config file ${filePath}:`, error)
    return {}
  }
}

// Load configuration from multiple sources
function loadEnvironmentVariables(): Record<string, string> {
  let env = { ...process.env }
  
  // Load from config files in order of precedence
  for (const configPath of CONFIG_PATHS) {
    const fileEnv = loadEnvFile(configPath)
    env = { ...env, ...fileEnv }
  }
  
  return env
}

// Generate default configuration values
function generateDefaults(): Partial<Record<string, string>> {
  const defaults: Partial<Record<string, string>> = {}
  
  // Generate JWT secret if not provided
  if (!process.env.JWT_SECRET) {
    defaults.JWT_SECRET = generateSecureKey(64)
    console.warn('JWT_SECRET not provided, generated a random one. Please set it in your environment for production.')
  }
  
  // Generate encryption key if not provided
  if (!process.env.ENCRYPTION_KEY) {
    defaults.ENCRYPTION_KEY = generateSecureKey(32)
    console.warn('ENCRYPTION_KEY not provided, generated a random one. Please set it in your environment for production.')
  }
  
  return defaults
}

// Generate a secure random key
function generateSecureKey(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// Validate configuration and provide helpful error messages
function validateConfig(env: Record<string, string>): Config {
  try {
    return configSchema.parse(env)
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Configuration validation failed:')
      error.errors.forEach(err => {
        const path = err.path.join('.')
        console.error(`  - ${path}: ${err.message}`)
        
        // Provide helpful suggestions
        if (path === 'JWT_SECRET' && err.code === 'too_small') {
          console.error('    Suggestion: Generate a secure JWT secret with at least 32 characters')
        }
        if (path === 'ENCRYPTION_KEY' && err.code === 'too_small') {
          console.error('    Suggestion: Generate a secure encryption key with at least 32 characters')
        }
        if (path === 'ADMIN_EMAIL' && err.code === 'invalid_string') {
          console.error('    Suggestion: Provide a valid email address for the admin user')
        }
      })
      
      console.error('\nExample configuration:')
      console.error('  JWT_SECRET=your-super-secret-jwt-key-change-this-in-production')
      console.error('  ENCRYPTION_KEY=your-32-character-encryption-key-here')
      console.error('  ADMIN_EMAIL=admin@example.com')
      console.error('  ADMIN_PASSWORD=secure-password')
    }
    
    throw error
  }
}

// Load and validate configuration
export function loadConfig(): Config {
  try {
    // Load environment variables from all sources
    const env = loadEnvironmentVariables()
    
    // Apply defaults for missing critical values
    const defaults = generateDefaults()
    const finalEnv = { ...defaults, ...env }
    
    // Validate and return configuration
    const config = validateConfig(finalEnv)
    
    // Log configuration summary (without sensitive values)
    console.log('Configuration loaded successfully:')
    console.log(`  - Environment: ${config.NODE_ENV}`)
    console.log(`  - Server: ${config.HOST}:${config.PORT}`)
    console.log(`  - HTTPS: ${config.HTTPS_ENABLED ? `Enabled on port ${config.HTTPS_PORT}` : 'Disabled'}`)
    console.log(`  - Database: ${config.DATABASE_DIR ? 'File-based' : 'In-memory'}`)
    console.log(`  - Log Level: ${config.LOG_LEVEL}`)
    console.log(`  - Security Headers: ${config.SECURITY_HEADERS_ENABLED ? 'Enabled' : 'Disabled'}`)
    console.log(`  - Health Check: ${config.HEALTH_CHECK_ENABLED ? 'Enabled' : 'Disabled'}`)
    
    return config
  } catch (error) {
    console.error('Failed to load configuration:', error)
    process.exit(1)
  }
}

// Configuration validation helper
export function validateConfigFile(filePath: string): boolean {
  try {
    const env = loadEnvFile(filePath)
    validateConfig(env)
    console.log(`Configuration file ${filePath} is valid`)
    return true
  } catch (error) {
    console.error(`Configuration file ${filePath} is invalid:`, error)
    return false
  }
}

// Get configuration value with type safety
export function getConfigValue<K extends keyof Config>(key: K): Config[K] {
  return config[key]
}

// Check if running in production
export function isProduction(): boolean {
  return config.NODE_ENV === 'production'
}

// Check if running in development
export function isDevelopment(): boolean {
  return config.NODE_ENV === 'development'
}

// Check if running in test
export function isTest(): boolean {
  return config.NODE_ENV === 'test'
}

// Export singleton config instance
export const config = loadConfig()
