import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock the config module to avoid singleton issues
vi.mock('./config', async () => {
  const actual = await vi.importActual('./config')
  return {
    ...actual,
    config: undefined, // Reset singleton
  }
})

import { loadConfig, validateConfigFile, getConfigValue, isProduction, isDevelopment, isTest } from './config'

describe('Configuration Management', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv }
    // Clear NODE_ENV to avoid test environment interference
    delete process.env.NODE_ENV
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
  })

  describe('loadConfig', () => {
    it('should load configuration with default values', () => {
      // Set minimum required values
      process.env.JWT_SECRET = 'test-jwt-secret-with-minimum-32-characters'
      process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters'

      const config = loadConfig()

      expect(config.PORT).toBe(3000)
      expect(config.HOST).toBe('localhost')
      expect(config.NODE_ENV).toBe('development')
      expect(config.API_KEY_PREFIX).toBe('envkey_')
      expect(config.LOG_LEVEL).toBe('info')
      expect(config.RATE_LIMIT_WINDOW_MS).toBe(900000)
      expect(config.RATE_LIMIT_MAX_REQUESTS).toBe(100)
      expect(config.SESSION_TIMEOUT_HOURS).toBe(24)
      expect(config.AUDIT_LOG_RETENTION_DAYS).toBe(90)
      expect(config.HEALTH_CHECK_ENABLED).toBe(true)
      expect(config.HEALTH_CHECK_PATH).toBe('/health')
      expect(config.APP_NAME).toBe('EnvKey Lite')
      expect(config.APP_VERSION).toBe('1.0.0')
    })

    it('should parse environment variables correctly', () => {
      process.env.PORT = '8080'
      process.env.HOST = '0.0.0.0'
      process.env.NODE_ENV = 'production'
      process.env.JWT_SECRET = 'production-jwt-secret-with-minimum-32-characters'
      process.env.ENCRYPTION_KEY = 'production-encryption-key-32-chars'
      process.env.LOG_LEVEL = 'error'
      process.env.RATE_LIMIT_MAX_REQUESTS = '200'
      process.env.SESSION_TIMEOUT_HOURS = '12'
      process.env.HEALTH_CHECK_ENABLED = 'false'

      const config = loadConfig()

      expect(config.PORT).toBe(8080)
      expect(config.HOST).toBe('0.0.0.0')
      expect(config.NODE_ENV).toBe('production')
      expect(config.LOG_LEVEL).toBe('error')
      expect(config.RATE_LIMIT_MAX_REQUESTS).toBe(200)
      expect(config.SESSION_TIMEOUT_HOURS).toBe(12)
      expect(config.HEALTH_CHECK_ENABLED).toBe(false)
    })

    it('should validate JWT_SECRET minimum length', () => {
      process.env.JWT_SECRET = 'short'
      process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters'

      expect(() => loadConfig()).toThrow()
    })

    it('should validate ENCRYPTION_KEY minimum length', () => {
      process.env.JWT_SECRET = 'test-jwt-secret-with-minimum-32-characters'
      process.env.ENCRYPTION_KEY = 'short'

      expect(() => loadConfig()).toThrow()
    })

    it('should validate NODE_ENV enum values', () => {
      process.env.NODE_ENV = 'invalid'
      process.env.JWT_SECRET = 'test-jwt-secret-with-minimum-32-characters'
      process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters'

      expect(() => loadConfig()).toThrow()
    })

    it('should validate LOG_LEVEL enum values', () => {
      process.env.LOG_LEVEL = 'invalid'
      process.env.JWT_SECRET = 'test-jwt-secret-with-minimum-32-characters'
      process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters'

      expect(() => loadConfig()).toThrow()
    })

    it('should validate admin email format', () => {
      process.env.ADMIN_EMAIL = 'invalid-email'
      process.env.JWT_SECRET = 'test-jwt-secret-with-minimum-32-characters'
      process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters'

      expect(() => loadConfig()).toThrow()
    })

    it('should validate admin password minimum length', () => {
      process.env.ADMIN_EMAIL = 'admin@example.com'
      process.env.ADMIN_PASSWORD = 'short'
      process.env.JWT_SECRET = 'test-jwt-secret-with-minimum-32-characters'
      process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters'

      expect(() => loadConfig()).toThrow()
    })

    it('should handle optional admin configuration', () => {
      process.env.JWT_SECRET = 'test-jwt-secret-with-minimum-32-characters'
      process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters'

      const config = loadConfig()

      expect(config.ADMIN_EMAIL).toBeUndefined()
      expect(config.ADMIN_PASSWORD).toBeUndefined()
      expect(config.ADMIN_NAME).toBe('Administrator')
    })
  })

  describe('utility functions', () => {
    beforeEach(() => {
      process.env.JWT_SECRET = 'test-jwt-secret-with-minimum-32-characters'
      process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters'
    })

    it('should detect production environment', () => {
      process.env.NODE_ENV = 'production'
      process.env.JWT_SECRET = 'test-jwt-secret-with-minimum-32-characters'
      process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters'
      
      const config = loadConfig()
      expect(config.NODE_ENV).toBe('production')
    })

    it('should detect development environment', () => {
      process.env.NODE_ENV = 'development'
      process.env.JWT_SECRET = 'test-jwt-secret-with-minimum-32-characters'
      process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters'
      
      const config = loadConfig()
      expect(config.NODE_ENV).toBe('development')
    })

    it('should detect test environment', () => {
      process.env.NODE_ENV = 'test'
      process.env.JWT_SECRET = 'test-jwt-secret-with-minimum-32-characters'
      process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters'
      
      const config = loadConfig()
      expect(config.NODE_ENV).toBe('test')
    })

    it('should get configuration values with type safety', () => {
      process.env.JWT_SECRET = 'test-jwt-secret-with-minimum-32-characters'
      process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters'
      
      const config = loadConfig()
      
      expect(config.PORT).toBe(3000)
      expect(config.NODE_ENV).toBe('development')
      expect(config.LOG_LEVEL).toBe('info')
    })
  })
})