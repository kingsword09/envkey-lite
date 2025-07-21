import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CryptoService, CryptoConfigSchema } from './crypto.service'
import { DatabaseManager } from '../db'

// Mock the database manager
vi.mock('../db', () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockResolvedValue([]),
  }

  return {
    DatabaseManager: vi.fn().mockImplementation(() => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      getDb: vi.fn().mockReturnValue(mockDb),
      query: vi.fn(),
      execute: vi.fn(),
      transaction: vi.fn(),
      close: vi.fn(),
    })),
  }
})

describe('CryptoService', () => {
  let cryptoService: CryptoService
  let dbManager: DatabaseManager

  beforeEach(async () => {
    // Create a new database manager instance for each test
    dbManager = new DatabaseManager({ dataDir: undefined }) // In-memory mode
    
    // Create a new crypto service instance
    cryptoService = new CryptoService(dbManager)
    
    // Mock the loadMasterKeyFromDb method to return null (no existing key)
    vi.spyOn(cryptoService as any, 'loadMasterKeyFromDb').mockResolvedValue(null)
    
    // Mock the storeMasterKeyInDb method to do nothing
    vi.spyOn(cryptoService as any, 'storeMasterKeyInDb').mockResolvedValue(undefined)
    
    // Initialize the crypto service
    await cryptoService.initialize()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt data correctly', async () => {
      // Arrange
      const plaintext = 'This is a secret message'

      // Act
      const encrypted = await cryptoService.encrypt(plaintext)
      const decrypted = await cryptoService.decrypt(encrypted)

      // Assert
      expect(decrypted).toBe(plaintext)
      expect(encrypted).not.toBe(plaintext)
      expect(typeof encrypted).toBe('string')
    })

    it('should throw an error when trying to decrypt invalid data', async () => {
      // Arrange
      const invalidEncrypted = '{"content":"invalid","iv":"invalid"}'

      // Act & Assert
      await expect(cryptoService.decrypt(invalidEncrypted)).rejects.toThrow()
    })
  })

  describe('hash and verify', () => {
    it('should hash data and verify it correctly', async () => {
      // Arrange
      const data = 'password123'

      // Act
      const hash = await cryptoService.hash(data)
      const isValid = await cryptoService.verify(data, hash)
      const isInvalid = await cryptoService.verify('wrongpassword', hash)

      // Assert
      expect(isValid).toBe(true)
      expect(isInvalid).toBe(false)
      expect(hash).not.toBe(data)
    })
  })

  describe('key management', () => {
    it('should generate a new key', async () => {
      // Act
      const key = await cryptoService.generateKey()

      // Assert
      expect(key).toBeDefined()
      expect(typeof key).toBe('string')
      expect(key.length).toBeGreaterThan(0)
    })

    it('should rotate keys', async () => {
      // Arrange
      const keyInfoBefore = cryptoService.getKeyInfo()
      
      // Act
      const keyInfo = await cryptoService.rotateKey()
      
      // Assert
      expect(keyInfo.id).toBeDefined()
      expect(keyInfo.id).not.toBe(keyInfoBefore.id)
    })

    it('should provide key info', () => {
      // Act
      const keyInfo = cryptoService.getKeyInfo()

      // Assert
      expect(keyInfo.id).toBeDefined()
      expect(keyInfo.createdAt).toBeInstanceOf(Date)
    })
  })

  describe('initialization', () => {
    it('should check if service is initialized', () => {
      // Act & Assert
      expect(cryptoService.isInitialized()).toBe(true)
    })

    it('should throw an error when using uninitialized service', async () => {
      // Arrange
      const uninitializedService = new CryptoService(dbManager)

      // Act & Assert
      expect(uninitializedService.isInitialized()).toBe(false)
      await expect(uninitializedService.encrypt('test')).rejects.toThrow('not initialized')
    })

    it('should initialize with an existing key', async () => {
      // Arrange
      const mockKeyData = { id: 'test-key-id', key: 'dGVzdC1rZXk=' } // Base64 for 'test-key'
      const service = new CryptoService(dbManager)
      vi.spyOn(service as any, 'loadMasterKeyFromDb').mockResolvedValue(mockKeyData)
      vi.spyOn(service as any, 'storeMasterKeyInDb').mockResolvedValue(undefined)

      // Act
      await service.initialize()

      // Assert
      expect(service.isInitialized()).toBe(true)
      expect(service.getKeyInfo().id).toBe('test-key-id')
    })
  })

  describe('enhanced functionality', () => {
    it('should encrypt sensitive data based on patterns', async () => {
      // Arrange
      const sensitiveValue = 'my-password-123'
      const nonSensitiveValue = 'regular text'

      // Act
      const sensitiveResult = await cryptoService.encryptIfSensitive(sensitiveValue)
      const nonSensitiveResult = await cryptoService.encryptIfSensitive(nonSensitiveValue)

      // Assert
      expect(sensitiveResult.encrypted).toBe(true)
      expect(sensitiveResult.value).not.toBe(sensitiveValue)
      expect(nonSensitiveResult.encrypted).toBe(false)
      expect(nonSensitiveResult.value).toBe(nonSensitiveValue)
    })

    it('should generate secure tokens', () => {
      // Act
      const token1 = cryptoService.generateToken()
      const token2 = cryptoService.generateToken()
      const customLengthToken = cryptoService.generateToken(64)

      // Assert
      expect(token1).toBeDefined()
      expect(token2).toBeDefined()
      expect(token1).not.toBe(token2) // Tokens should be unique
      expect(customLengthToken.length).toBeGreaterThan(token1.length) // Longer token
    })

    it('should generate API keys with prefix', () => {
      // Act
      const defaultKey = cryptoService.generateApiKey()
      const customKey = cryptoService.generateApiKey('custom')

      // Assert
      expect(defaultKey.startsWith('ak_')).toBe(true)
      expect(customKey.startsWith('custom_')).toBe(true)
    })

    it('should export and import keys', async () => {
      // Arrange
      const password = 'secure-password-123'
      
      // Act
      const exportedKey = await cryptoService.exportKey(password)
      
      // Create a new service instance
      const newService = new CryptoService(dbManager)
      vi.spyOn(newService as any, 'storeMasterKeyInDb').mockResolvedValue(undefined)
      
      const importResult = await newService.importKey(exportedKey, password)
      
      // Assert
      expect(exportedKey).toBeDefined()
      expect(typeof exportedKey).toBe('string')
      expect(importResult).toBe(true)
      expect(newService.isInitialized()).toBe(true)
    })
  })

  describe('config validation', () => {
    it('should validate crypto configuration', () => {
      // Valid config
      const validConfig = {
        algorithm: 'aes-256-gcm',
        iterations: 100000,
        keyLength: 32,
        digest: 'sha512',
        saltLength: 16,
        ivLength: 12,
        authTagLength: 16
      }
      
      // Parse should succeed
      expect(() => CryptoConfigSchema.parse(validConfig)).not.toThrow()
      
      // Default values should be applied
      const partialConfig = CryptoConfigSchema.parse({})
      expect(partialConfig).toEqual(validConfig)
      
      // Invalid values should fail
      expect(() => CryptoConfigSchema.parse({ iterations: -1 })).toThrow()
      expect(() => CryptoConfigSchema.parse({ keyLength: 0 })).toThrow()
    })
  })

  describe('new functionality', () => {
    it('should detect sensitive values', () => {
      // Arrange
      const sensitiveValues = [
        'password123',
        'my_secret_key',
        'api_key=abc123',
        'access_token=xyz',
        'sk_test_1234567890abcdef',
        'private_key_content'
      ]
      
      const nonSensitiveValues = [
        'username',
        'description',
        'count=5',
        'normal text',
        'application'
      ]
      
      // Act & Assert
      sensitiveValues.forEach(value => {
        expect(cryptoService.isSensitiveValue(value)).toBe(true)
      })
      
      nonSensitiveValues.forEach(value => {
        expect(cryptoService.isSensitiveValue(value)).toBe(false)
      })
      
      // Custom patterns
      expect(cryptoService.isSensitiveValue('custom_pattern', [/custom/])).toBe(true)
      expect(cryptoService.isSensitiveValue('normal_text', [/custom/])).toBe(false)
    })
    
    it('should encrypt and decrypt batches of values', async () => {
      // Arrange
      const values = ['value1', 'value2', 'value3']
      
      // Act
      const encrypted = await cryptoService.encryptBatch(values)
      const decrypted = await cryptoService.decryptBatch(encrypted)
      
      // Assert
      expect(encrypted.length).toBe(3)
      expect(decrypted.length).toBe(3)
      expect(decrypted).toEqual(values)
      
      // Each value should be encrypted differently
      expect(encrypted[0]).not.toBe(encrypted[1])
      expect(encrypted[1]).not.toBe(encrypted[2])
    })
    
    it('should generate deterministic hashes', () => {
      // Arrange
      const value = 'test-value'
      
      // Act
      const hash1 = cryptoService.generateDeterministicHash(value)
      const hash2 = cryptoService.generateDeterministicHash(value)
      const hashWithSalt = cryptoService.generateDeterministicHash(value, 'custom-salt')
      
      // Assert
      expect(hash1).toBe(hash2) // Same input should produce same hash
      expect(hash1).not.toBe(hashWithSalt) // Different salt should produce different hash
      expect(hash1.length).toBe(64) // SHA-256 produces 64 character hex string
    })
    
    it('should validate password strength', () => {
      // Arrange
      const strongPassword = 'StrongP@ssw0rd123!'
      const mediumPassword = 'Password123'
      const weakPassword = 'password'
      
      // Act
      const strongResult = cryptoService.validatePasswordStrength(strongPassword)
      const mediumResult = cryptoService.validatePasswordStrength(mediumPassword)
      const weakResult = cryptoService.validatePasswordStrength(weakPassword)
      
      // Assert
      expect(strongResult.isStrong).toBe(true)
      expect(strongResult.score).toBeGreaterThanOrEqual(4)
      
      expect(mediumResult.isStrong).toBe(false)
      expect(mediumResult.score).toBeLessThan(4)
      expect(mediumResult.score).toBeGreaterThan(1)
      
      expect(weakResult.isStrong).toBe(false)
      expect(weakResult.score).toBeLessThan(2)
      expect(weakResult.feedback.length).toBeGreaterThan(0)
    })
  })
})