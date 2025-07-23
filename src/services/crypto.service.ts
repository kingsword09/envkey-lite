import crypto from 'crypto'
import { DatabaseManager } from '../db'
import { systemConfig } from '../db/schema'
import { eq, like } from 'drizzle-orm'
import { z } from 'zod'

/**
 * Configuration options for the CryptoService
 */
export interface CryptoServiceOptions {
  /**
   * The encryption algorithm to use
   * @default 'aes-256-gcm'
   */
  algorithm?: string

  /**
   * The key derivation iterations
   * @default 100000
   */
  iterations?: number

  /**
   * The key length in bytes
   * @default 32
   */
  keyLength?: number

  /**
   * The digest algorithm for key derivation
   * @default 'sha512'
   */
  digest?: string

  /**
   * The salt length in bytes
   * @default 16
   */
  saltLength?: number

  /**
   * The initialization vector (IV) length in bytes
   * @default 12 (for GCM mode)
   */
  ivLength?: number

  /**
   * The authentication tag length in bytes (for GCM mode)
   * @default 16
   */
  authTagLength?: number
}

/**
 * Interface for encrypted data
 */
export interface EncryptedData {
  /**
   * The encrypted content (base64 encoded)
   */
  content: string

  /**
   * The initialization vector (base64 encoded)
   */
  iv: string

  /**
   * The authentication tag (base64 encoded) - only for GCM mode
   */
  authTag?: string
}

/**
 * Interface for key information
 */
export interface KeyInfo {
  /**
   * The key ID
   */
  id: string

  /**
   * The key creation timestamp
   */
  createdAt: Date
}

/**
 * Schema for validating encryption configuration
 */
export const CryptoConfigSchema = z.object({
  algorithm: z.string().default('aes-256-gcm'),
  iterations: z.number().int().positive().default(100000),
  keyLength: z.number().int().positive().default(32),
  digest: z.string().default('sha512'),
  saltLength: z.number().int().positive().default(16),
  ivLength: z.number().int().positive().default(12),
  authTagLength: z.number().int().positive().default(16),
})

/**
 * CryptoService provides cryptographic operations for the application
 * including encryption, decryption, key management, and hashing
 */
export class CryptoService {
  private readonly algorithm: string
  private readonly iterations: number
  private readonly keyLength: number
  private readonly digest: string
  private readonly saltLength: number
  private readonly ivLength: number
  private readonly authTagLength: number
  private readonly dbManager: DatabaseManager
  private masterKey: Buffer | null = null
  private keyId: string | null = null
  private createdAt: Date | null = null

  /**
   * Creates a new CryptoService instance
   * 
   * @param dbManager - The database manager instance
   * @param options - Configuration options
   */
  constructor(dbManager: DatabaseManager, options: CryptoServiceOptions = {}) {
    this.dbManager = dbManager
    this.algorithm = options.algorithm || 'aes-256-gcm'
    this.iterations = options.iterations || 100000
    this.keyLength = options.keyLength || 32
    this.digest = options.digest || 'sha512'
    this.saltLength = options.saltLength || 16
    this.ivLength = options.ivLength || 12
    this.authTagLength = options.authTagLength || 16
  }

  /**
   * Initialize the crypto service by loading or generating the master key
   * 
   * @param secret - Optional secret to derive the key from
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(secret?: string): Promise<void> {
    // Try to load existing master key from database
    const keyData = await this.loadMasterKeyFromDb()

    if (keyData) {
      // Use existing key
      this.masterKey = Buffer.from(keyData.key, 'base64')
      this.keyId = keyData.id
      this.createdAt = new Date() // Ideally this would come from the database
    } else {
      // Generate and store a new master key
      await this.generateAndStoreMasterKey(secret)
    }
  }

  /**
   * Encrypt a plaintext string
   * 
   * @param plaintext - The text to encrypt
   * @returns The encrypted data
   * @throws Error if the service is not initialized
   */
  async encrypt(plaintext: string): Promise<string> {
    this.ensureInitialized()

    // Generate a random IV
    const iv = crypto.randomBytes(this.ivLength)

    // Create cipher
    const cipher = crypto.createCipheriv(
      this.algorithm,
      this.masterKey!,
      iv
    ) as crypto.CipherGCM

    // Encrypt the data
    let encrypted = cipher.update(plaintext, 'utf8', 'base64')
    encrypted += cipher.final('base64')

    // Get the auth tag (for GCM mode)
    const authTag = cipher.getAuthTag().toString('base64')

    // Create the encrypted data object
    const encryptedData: EncryptedData = {
      content: encrypted,
      iv: iv.toString('base64'),
      authTag
    }

    // Return the serialized encrypted data
    return JSON.stringify(encryptedData)
  }

  /**
   * Decrypt an encrypted string
   * 
   * @param encryptedString - The encrypted string to decrypt
   * @returns The decrypted plaintext
   * @throws Error if the service is not initialized or decryption fails
   */
  async decrypt(encryptedString: string): Promise<string> {
    this.ensureInitialized()

    try {
      // Parse the encrypted data
      const encryptedData = JSON.parse(encryptedString) as EncryptedData

      // Create decipher
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.masterKey!,
        Buffer.from(encryptedData.iv, 'base64')
      ) as crypto.DecipherGCM

      // Set auth tag for GCM mode
      if (encryptedData.authTag) {
        decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'base64'))
      }

      // Decrypt the data
      let decrypted = decipher.update(encryptedData.content, 'base64', 'utf8')
      decrypted += decipher.final('utf8')

      return decrypted
    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Generate a new encryption key
   * 
   * @returns The generated key as a base64 string
   */
  async generateKey(): Promise<string> {
    const key = crypto.randomBytes(this.keyLength)
    return key.toString('base64')
  }

  /**
   * Rotate the master encryption key
   * 
   * @param newSecret - Optional secret to derive the new key from
   * @returns Information about the new key
   * @throws Error if the service is not initialized
   */
  async rotateKey(newSecret?: string): Promise<KeyInfo> {
    this.ensureInitialized()

    // Store the old key for re-encryption
    const oldKeyId = this.keyId

    // Generate and store a new master key
    await this.generateAndStoreMasterKey(newSecret)

    // Store the key rotation event in the database
    try {
      const db = this.dbManager.getDb()
      await db
        .insert(systemConfig)
        .values({
          key: `key_rotation_${this.keyId}`,
          value: { 
            previousKeyId: oldKeyId,
            timestamp: new Date().toISOString()
          },
          updatedAt: new Date()
        })
        
      // Re-encrypt data with the new key if needed
      // This would typically involve fetching all encrypted data and re-encrypting it
      // For now, we're just recording the rotation event
      // In a real implementation, we would need to re-encrypt all sensitive data
      
    } catch (error: unknown) {
      console.error('Failed to record key rotation event:', error)
      // Continue execution - this is not critical
    }

    // Return information about the new key
    return {
      id: this.keyId!,
      createdAt: new Date()
    }
  }

  /**
   * Create a hash of the provided data
   * 
   * @param data - The data to hash
   * @returns The hash as a base64 string
   */
  async hash(data: string): Promise<string> {
    // Generate a random salt
    const salt = crypto.randomBytes(this.saltLength)

    // Hash the data with the salt
    const derivedKey = await this.pbkdf2(data, salt)

    // Combine salt and hash
    const result = Buffer.concat([salt, derivedKey])

    // Return as base64
    return result.toString('base64')
  }

  /**
   * Verify if the provided data matches the hash
   * 
   * @param data - The data to verify
   * @param hash - The hash to verify against
   * @returns True if the data matches the hash, false otherwise
   */
  async verify(data: string, hash: string): Promise<boolean> {
    try {
      // Decode the hash
      const hashBuffer = Buffer.from(hash, 'base64')

      // Extract the salt (first saltLength bytes)
      const salt = hashBuffer.subarray(0, this.saltLength)

      // Extract the stored hash
      const storedHash = hashBuffer.subarray(this.saltLength)

      // Hash the provided data with the extracted salt
      const derivedKey = await this.pbkdf2(data, salt)

      // Compare the hashes
      return crypto.timingSafeEqual(derivedKey, storedHash)
    } catch (_error) {
      return false
    }
  }

  /**
   * Get information about the current master key
   * 
   * @returns Information about the current key
   * @throws Error if the service is not initialized
   */
  getKeyInfo(): KeyInfo {
    this.ensureInitialized()

    return {
      id: this.keyId!,
      createdAt: this.createdAt || new Date()
    }
  }
  
  /**
   * List all key rotation events
   * 
   * @returns Array of key rotation events
   * @throws Error if the service is not initialized
   */
  async listKeyRotations(): Promise<Array<{id: string, previousKeyId: string, timestamp: Date}>> {
    this.ensureInitialized()
    
    try {
      const db = this.dbManager.getDb()
      const results = await db
        .select()
        .from(systemConfig)
        .where(like(systemConfig.key, 'key_rotation_%'))
      
      return results.map(row => {
        const value = row.value as { previousKeyId: string; timestamp: string }
        return {
          id: row.key.replace('key_rotation_', ''),
          previousKeyId: value.previousKeyId,
          timestamp: new Date(value.timestamp)
        }
      })
    } catch (error) {
      console.error('Failed to list key rotations:', error)
      return []
    }
  }

  /**
   * Check if the service is initialized
   * 
   * @returns True if the service is initialized, false otherwise
   */
  isInitialized(): boolean {
    return this.masterKey !== null && this.keyId !== null
  }

  /**
   * Ensure the service is initialized
   * 
   * @throws Error if the service is not initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized()) {
      throw new Error('CryptoService is not initialized. Call initialize() first.')
    }
  }

  /**
   * Load the master key from the database
   * 
   * @returns The master key data or null if not found
   */
  private async loadMasterKeyFromDb(): Promise<{ id: string; key: string } | null> {
    try {
      const db = this.dbManager.getDb()
      const result = await db.select().from(systemConfig).where(eq(systemConfig.key, 'master_key'))

      if (result.length === 0) {
        return null
      }

      const keyData = result[0]?.value as { id: string; key: string } | undefined
      if (!keyData || !keyData.id || !keyData.key) {
        return null
      }
      
      return keyData
    } catch (error) {
      console.error('Failed to load master key:', error)
      return null
    }
  }

  /**
   * Generate and store a new master key
   * 
   * @param secret - Optional secret to derive the key from
   */
  private async generateAndStoreMasterKey(secret?: string): Promise<void> {
    // Generate a new key ID
    const keyId = crypto.randomUUID()

    // Generate a new master key
    let masterKey: Buffer

    if (secret) {
      // Derive key from secret
      const salt = crypto.randomBytes(this.saltLength)
      masterKey = await this.pbkdf2(secret, salt)
    } else {
      // Generate random key
      masterKey = crypto.randomBytes(this.keyLength)
    }

    // Store the key in memory
    this.masterKey = masterKey
    this.keyId = keyId

    // Store the key in the database
    await this.storeMasterKeyInDb(keyId, masterKey)
  }

  /**
   * Store the master key in the database
   * 
   * @param keyId - The key ID
   * @param key - The key to store
   */
  private async storeMasterKeyInDb(keyId: string, key: Buffer): Promise<void> {
    try {
      const db = this.dbManager.getDb()
      
      // Store the key in the database
      await db
        .insert(systemConfig)
        .values({
          key: 'master_key',
          value: { id: keyId, key: key.toString('base64') },
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: systemConfig.key,
          set: {
            value: { id: keyId, key: key.toString('base64') },
            updatedAt: new Date()
          }
        })
    } catch (error) {
      throw new Error(`Failed to store master key: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Derive a key using PBKDF2
   * 
   * @param password - The password to derive from
   * @param salt - The salt to use
   * @returns The derived key
   */
  private pbkdf2(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(
        password,
        salt,
        this.iterations,
        this.keyLength,
        this.digest,
        (err, derivedKey) => {
          if (err) {
            reject(err)
          } else {
            resolve(derivedKey)
          }
        }
      )
    })
  }

  /**
   * Encrypt a value only if it contains sensitive patterns
   * 
   * @param value - The value to check and potentially encrypt
   * @param sensitivePatterns - Array of regex patterns to check for sensitive data
   * @returns Object containing the potentially encrypted value and whether it was encrypted
   */
  async encryptIfSensitive(value: string, sensitivePatterns: RegExp[] = []): Promise<{ value: string; encrypted: boolean }> {
    // Default sensitive patterns if none provided
    const patterns = sensitivePatterns.length > 0 ? sensitivePatterns : [
      /password/i,
      /secret/i,
      /token/i,
      /key/i,
      /credential/i,
      /private/i
    ]

    // Check if the value contains any sensitive patterns
    const isSensitive = patterns.some(pattern => pattern.test(value))

    if (isSensitive) {
      return {
        value: await this.encrypt(value),
        encrypted: true
      }
    }

    return {
      value,
      encrypted: false
    }
  }

  /**
   * Generate a secure random token of specified length
   * 
   * @param length - The length of the token in bytes (default: 32)
   * @returns A secure random token as a base64 string
   */
  generateToken(length: number = 32): string {
    const token = crypto.randomBytes(length)
    return token.toString('base64url')
  }

  /**
   * Generate a secure API key with a prefix for identification
   * 
   * @param prefix - Optional prefix for the API key
   * @returns A secure API key
   */
  generateApiKey(prefix: string = 'ak'): string {
    const randomPart = crypto.randomBytes(24).toString('base64url')
    return `${prefix}_${randomPart}`
  }

  /**
   * Create a secure hash for storing API keys or passwords
   * 
   * @param value - The value to hash
   * @returns A secure hash suitable for storage
   */
  async secureHash(value: string): Promise<string> {
    return this.hash(value)
  }

  /**
   * Export the current encryption key in a secure format
   * This can be used for backup purposes
   * 
   * @param password - Password to encrypt the export with
   * @returns Encrypted key export as a string
   */
  async exportKey(password: string): Promise<string> {
    this.ensureInitialized()
    
    const keyData = {
      id: this.keyId,
      key: this.masterKey?.toString('base64'),
      algorithm: this.algorithm,
      createdAt: new Date().toISOString()
    }
    
    // Generate a key from the password
    const salt = crypto.randomBytes(this.saltLength)
    const key = await this.pbkdf2(password, salt)
    
    // Encrypt the key data
    const iv = crypto.randomBytes(this.ivLength)
    const cipher = crypto.createCipheriv(this.algorithm, key, iv) as crypto.CipherGCM
    
    let encrypted = cipher.update(JSON.stringify(keyData), 'utf8', 'base64')
    encrypted += cipher.final('base64')
    
    const authTag = cipher.getAuthTag().toString('base64')
    
    // Return the encrypted key with metadata
    return JSON.stringify({
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      authTag,
      data: encrypted,
      iterations: this.iterations,
      algorithm: this.algorithm
    })
  }

  /**
   * Import an encryption key from a secure export
   * 
   * @param exportData - The exported key data
   * @param password - Password to decrypt the export with
   * @returns True if import was successful
   */
  async importKey(exportData: string, password: string): Promise<boolean> {
    try {
      const exportObj = JSON.parse(exportData)
      
      // Extract the metadata
      const salt = Buffer.from(exportObj.salt, 'base64')
      const iv = Buffer.from(exportObj.iv, 'base64')
      const authTag = Buffer.from(exportObj.authTag, 'base64')
      const encryptedData = exportObj.data
      
      // Derive the key from the password
      const key = await this.pbkdf2(password, salt)
      
      // Decrypt the data
      const decipher = crypto.createDecipheriv(exportObj.algorithm, key, iv) as crypto.DecipherGCM
      decipher.setAuthTag(authTag)
      
      let decrypted = decipher.update(encryptedData, 'base64', 'utf8')
      decrypted += decipher.final('utf8')
      
      // Parse the decrypted key data
      const keyData = JSON.parse(decrypted)
      
      // Store the imported key
      this.masterKey = Buffer.from(keyData.key, 'base64')
      this.keyId = keyData.id
      this.createdAt = new Date(keyData.createdAt)
      
      // Save to database
      await this.storeMasterKeyInDb(this.keyId!, this.masterKey)
      
      return true
    } catch (_error) {
      console.error('Key import failed:', _error)
      return false
    }
  }

  /**
   * Detect if a string contains sensitive information based on patterns
   * 
   * @param value - The string to check
   * @param sensitivePatterns - Optional array of regex patterns to check
   * @returns True if the string contains sensitive information
   */
  isSensitiveValue(value: string, sensitivePatterns?: RegExp[]): boolean {
    // Default sensitive patterns if none provided
    const patterns = sensitivePatterns || [
      /password/i,
      /secret/i,
      /token/i,
      /key/i,
      /credential/i,
      /private/i,
      /auth/i,
      /api[-_]?key/i,
      /access[-_]?token/i,
      /refresh[-_]?token/i,
      /jwt/i,
      /certificate/i,
      /passphrase/i,
      /^pk_/i, // Stripe-like public keys
      /^sk_/i, // Stripe-like secret keys
      /^[A-Za-z0-9+/]{40,}={0,2}$/, // Likely base64 encoded secrets
    ]

    return patterns.some(pattern => pattern.test(value))
  }

  /**
   * Encrypt a batch of values
   * 
   * @param values - Array of values to encrypt
   * @returns Array of encrypted values
   */
  async encryptBatch(values: string[]): Promise<string[]> {
    this.ensureInitialized()
    return Promise.all(values.map(value => this.encrypt(value)))
  }

  /**
   * Decrypt a batch of values
   * 
   * @param encryptedValues - Array of encrypted values to decrypt
   * @returns Array of decrypted values
   */
  async decryptBatch(encryptedValues: string[]): Promise<string[]> {
    this.ensureInitialized()
    return Promise.all(encryptedValues.map(value => this.decrypt(value)))
  }

  /**
   * Generate a deterministic hash for a value
   * Useful for creating consistent identifiers from input data
   * 
   * @param data - The data to hash
   * @param salt - Optional salt to use (if not provided, a fixed salt is used)
   * @returns A hex string hash
   */
  generateDeterministicHash(data: string, salt?: string): string {
    const fixedSalt = salt || 'envkey-lite-fixed-salt'
    return crypto
      .createHash('sha256')
      .update(fixedSalt + data)
      .digest('hex')
  }

  /**
   * Validate the strength of a password or secret
   * 
   * @param password - The password to validate
   * @returns Object containing validation result and strength score
   */
  validatePasswordStrength(password: string): { 
    isStrong: boolean; 
    score: number; 
    feedback: string[] 
  } {
    const feedback: string[] = []
    let score = 0

    // Length check
    if (password.length >= 12) {
      score += 2
    } else if (password.length >= 8) {
      score += 1
      feedback.push('Password should be at least 12 characters long for better security')
    } else {
      feedback.push('Password is too short, it should be at least 8 characters')
    }

    // Complexity checks
    if (/[A-Z]/.test(password)) score += 1
    else feedback.push('Password should include uppercase letters')
    
    if (/[a-z]/.test(password)) score += 1
    else feedback.push('Password should include lowercase letters')
    
    if (/[0-9]/.test(password)) score += 1
    else feedback.push('Password should include numbers')
    
    if (/[^A-Za-z0-9]/.test(password)) score += 1
    else feedback.push('Password should include special characters')

    // Common patterns check
    const commonPatterns = [
      /^123/, /password/i, /admin/i, /user/i, /welcome/i,
      /qwerty/i, /abc123/i, /letmein/i, /monkey/i, /login/i
    ]
    
    if (commonPatterns.some(pattern => pattern.test(password))) {
      score -= 1
      feedback.push('Password contains common patterns that are easy to guess')
    }

    // Repeated characters
    if (/(.)\1{2,}/.test(password)) {
      score -= 1
      feedback.push('Password contains repeated character sequences')
    }

    return {
      isStrong: score >= 4,
      score: Math.max(0, Math.min(5, score)),
      feedback: feedback.length > 0 ? feedback : ['Password strength is good']
    }
  }
}
