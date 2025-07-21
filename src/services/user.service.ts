import { DatabaseManager } from '../db'
import { users, apiKeys, User, NewUser, ApiKey, NewApiKey } from '../db/schema'
import { CreateUserData, UpdateUserData } from '../types/user'
import { CryptoService } from './crypto.service'
import { eq, and, sql } from 'drizzle-orm'

/**
 * UserService class for managing user operations
 * Handles user CRUD operations, authentication, and API key management
 */
export class UserService {
  private dbManager: DatabaseManager
  private cryptoService: CryptoService

  /**
   * Creates a new UserService instance
   * 
   * @param dbManager - The database manager instance
   * @param cryptoService - The crypto service instance for password hashing and API key operations
   */
  constructor(dbManager: DatabaseManager, cryptoService: CryptoService) {
    this.dbManager = dbManager
    this.cryptoService = cryptoService
  }

  /**
   * Create a new user
   * 
   * @param userData - User data for creation
   * @returns The created user
   * @throws Error if user creation fails
   */
  async createUser(userData: CreateUserData): Promise<User> {
    try {
      // Hash the password
      const passwordHash = await this.cryptoService.hash(userData.password)

      // Prepare user data for insertion
      const newUser: NewUser = {
        email: userData.email,
        name: userData.name,
        passwordHash,
        role: userData.role || 'user',
      }

      // Insert the user into the database
      const db = this.dbManager.getDb()
      const result = await db.insert(users).values(newUser).returning()

      if (result.length === 0) {
        throw new Error('Failed to create user')
      }

      return result[0]
    } catch (error) {
      throw new Error(`User creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get a user by ID
   * 
   * @param id - The user ID
   * @returns The user or null if not found
   */
  async getUserById(id: string): Promise<User | null> {
    try {
      const db = this.dbManager.getDb()
      const result = await db.select().from(users).where(eq(users.id, id))
      return result.length > 0 ? result[0] : null
    } catch (error) {
      console.error('Error fetching user by ID:', error)
      return null
    }
  }

  /**
   * Get a user by email
   * 
   * @param email - The user email
   * @returns The user or null if not found
   */
  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const db = this.dbManager.getDb()
      const result = await db.select().from(users).where(eq(users.email, email))
      return result.length > 0 ? result[0] : null
    } catch (error) {
      console.error('Error fetching user by email:', error)
      return null
    }
  }

  /**
   * Get all users
   * 
   * @param limit - Optional limit for the number of users to return
   * @param offset - Optional offset for pagination
   * @returns Array of users
   */
  async getAllUsers(limit?: number, offset?: number): Promise<User[]> {
    try {
      const db = this.dbManager.getDb()
      let query = db.select().from(users)

      // Apply pagination if provided
      if (limit !== undefined) {
        query = query.limit(limit)
      }
      if (offset !== undefined) {
        query = query.offset(offset)
      }

      return await query
    } catch (error) {
      console.error('Error fetching all users:', error)
      return []
    }
  }

  /**
   * Update a user
   * 
   * @param id - The user ID
   * @param userData - User data to update
   * @returns The updated user or null if not found
   */
  async updateUser(id: string, userData: UpdateUserData): Promise<User | null> {
    try {
      const db = this.dbManager.getDb()
      
      // Prepare update data
      const updateData: Partial<NewUser> = {}
      if (userData.name !== undefined) updateData.name = userData.name
      if (userData.email !== undefined) updateData.email = userData.email
      if (userData.role !== undefined) updateData.role = userData.role
      
      // Add updated timestamp
      updateData.updatedAt = new Date()

      // Update the user
      const result = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, id))
        .returning()

      return result.length > 0 ? result[0] : null
    } catch (error) {
      throw new Error(`User update failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Delete a user
   * 
   * @param id - The user ID
   * @returns True if the user was deleted, false otherwise
   */
  async deleteUser(id: string): Promise<boolean> {
    try {
      const db = this.dbManager.getDb()
      const result = await db.delete(users).where(eq(users.id, id)).returning()
      return result.length > 0
    } catch (error) {
      console.error('Error deleting user:', error)
      return false
    }
  }

  /**
   * Change a user's password
   * 
   * @param id - The user ID
   * @param currentPassword - The current password for verification
   * @param newPassword - The new password
   * @returns True if the password was changed, false otherwise
   */
  async changePassword(id: string, currentPassword: string, newPassword: string): Promise<boolean> {
    try {
      // Get the user
      const user = await this.getUserById(id)
      if (!user) {
        return false
      }

      // Verify the current password
      const isPasswordValid = await this.cryptoService.verify(currentPassword, user.passwordHash)
      if (!isPasswordValid) {
        return false
      }

      // Hash the new password
      const newPasswordHash = await this.cryptoService.hash(newPassword)

      // Update the password
      const db = this.dbManager.getDb()
      const result = await db
        .update(users)
        .set({ 
          passwordHash: newPasswordHash,
          updatedAt: new Date()
        })
        .where(eq(users.id, id))
        .returning()

      return result.length > 0
    } catch (error) {
      console.error('Error changing password:', error)
      return false
    }
  }

  /**
   * Reset a user's password (admin function)
   * 
   * @param id - The user ID
   * @param newPassword - The new password
   * @returns True if the password was reset, false otherwise
   */
  async resetPassword(id: string, newPassword: string): Promise<boolean> {
    try {
      // Hash the new password
      const newPasswordHash = await this.cryptoService.hash(newPassword)

      // Update the password
      const db = this.dbManager.getDb()
      const result = await db
        .update(users)
        .set({ 
          passwordHash: newPasswordHash,
          updatedAt: new Date()
        })
        .where(eq(users.id, id))
        .returning()

      return result.length > 0
    } catch (error) {
      console.error('Error resetting password:', error)
      return false
    }
  }

  /**
   * Authenticate a user with email and password
   * 
   * @param email - The user email
   * @param password - The user password
   * @returns The authenticated user or null if authentication fails
   */
  async authenticateUser(email: string, password: string): Promise<User | null> {
    try {
      // Get the user by email
      const user = await this.getUserByEmail(email)
      if (!user) {
        return null
      }

      // Verify the password
      const isPasswordValid = await this.cryptoService.verify(password, user.passwordHash)
      if (!isPasswordValid) {
        return null
      }

      return user
    } catch (error) {
      console.error('Authentication error:', error)
      return null
    }
  }

  /**
   * Create an API key for a user
   * 
   * @param userId - The user ID
   * @param name - A name for the API key
   * @returns The created API key or null if creation fails
   */
  async createApiKey(userId: string, name: string): Promise<{ id: string, key: string } | null> {
    try {
      // Check if the user exists
      const user = await this.getUserById(userId)
      if (!user) {
        return null
      }

      // Generate a new API key
      const apiKey = this.cryptoService.generateApiKey()
      
      // Hash the API key for storage
      const keyHash = await this.cryptoService.secureHash(apiKey)

      // Create the API key record
      const db = this.dbManager.getDb()
      const newApiKey: NewApiKey = {
        userId,
        name,
        keyHash,
      }

      const result = await db.insert(apiKeys).values(newApiKey).returning()
      
      if (result.length === 0) {
        return null
      }

      // Return the API key details
      // Note: The actual API key is only returned once and cannot be retrieved later
      return {
        id: result[0].id,
        key: apiKey
      }
    } catch (error) {
      console.error('Error creating API key:', error)
      return null
    }
  }

  /**
   * Get all API keys for a user
   * 
   * @param userId - The user ID
   * @returns Array of API keys (without the actual key values)
   */
  async getUserApiKeys(userId: string): Promise<ApiKey[]> {
    try {
      const db = this.dbManager.getDb()
      return await db.select().from(apiKeys).where(eq(apiKeys.userId, userId))
    } catch (error) {
      console.error('Error fetching user API keys:', error)
      return []
    }
  }

  /**
   * Delete an API key
   * 
   * @param id - The API key ID
   * @param userId - The user ID (for verification)
   * @returns True if the API key was deleted, false otherwise
   */
  async deleteApiKey(id: string, userId: string): Promise<boolean> {
    try {
      const db = this.dbManager.getDb()
      const result = await db
        .delete(apiKeys)
        .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
        .returning()
      
      return result.length > 0
    } catch (error) {
      console.error('Error deleting API key:', error)
      return false
    }
  }

  /**
   * Verify an API key
   * 
   * @param apiKey - The API key to verify
   * @returns The user associated with the API key or null if verification fails
   */
  async verifyApiKey(apiKey: string): Promise<User | null> {
    try {
      const db = this.dbManager.getDb()
      
      // Get all API keys (this is not efficient but necessary since we need to verify the hash)
      const allKeys = await db.select().from(apiKeys)
      
      // Find the matching key by verifying the hash
      for (const key of allKeys) {
        const isValid = await this.cryptoService.verify(apiKey, key.keyHash)
        if (isValid) {
          // Update the last used timestamp
          await db
            .update(apiKeys)
            .set({ lastUsedAt: new Date() })
            .where(eq(apiKeys.id, key.id))
          
          // Return the associated user
          return await this.getUserById(key.userId)
        }
      }
      
      return null
    } catch (error) {
      console.error('Error verifying API key:', error)
      return null
    }
  }

  /**
   * Count the total number of users
   * 
   * @returns The total number of users
   */
  async countUsers(): Promise<number> {
    try {
      const db = this.dbManager.getDb()
      const result = await db.select({ count: sql<number>`count(*)` }).from(users)
      return result[0]?.count || 0
    } catch (error) {
      console.error('Error counting users:', error)
      return 0
    }
  }

  /**
   * Check if a user with the given email exists
   * 
   * @param email - The email to check
   * @returns True if a user with the email exists, false otherwise
   */
  async emailExists(email: string): Promise<boolean> {
    const user = await this.getUserByEmail(email)
    return user !== null
  }

  /**
   * Validate password strength
   * 
   * @param password - The password to validate
   * @returns Validation result with strength score and feedback
   */
  validatePasswordStrength(password: string): { 
    isStrong: boolean; 
    score: number; 
    feedback: string[] 
  } {
    return this.cryptoService.validatePasswordStrength(password)
  }
}