import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { UserService } from './user.service'
import { CryptoService } from './crypto.service'
import { AuditService } from './audit.service'
import { DatabaseManager } from '../db'
import { createIsolatedTestDb } from '../../test/setup'
import { createUser, createUserData, createApiKey } from '../../test/factories'
import { ValidationError, NotFoundError, ConflictError } from '../middleware/error.middleware'

describe('UserService', () => {
  let userService: UserService
  let cryptoService: CryptoService
  let auditService: AuditService
  let dbManager: DatabaseManager

  beforeEach(async () => {
    // Create isolated test database
    dbManager = await createIsolatedTestDb()
    await dbManager.runMigrations({ force: true })
    
    // Initialize services
    cryptoService = new CryptoService(dbManager)
    await cryptoService.initialize()
    
    auditService = new AuditService(dbManager)
    userService = new UserService(dbManager, cryptoService, auditService)
  })

  afterEach(async () => {
    if (dbManager?.isReady()) {
      await dbManager.close()
    }
  })

  describe('createUser', () => {
    it('should create a new user successfully', async () => {
      // Arrange
      const userData = createUserData({
        email: 'test@example.com',
        name: 'Test User'
      })

      // Act
      const user = await userService.createUser(userData)

      // Assert
      expect(user).toBeDefined()
      expect(user.id).toBeDefined()
      expect(user.email).toBe(userData.email)
      expect(user.name).toBe(userData.name)
      expect(user.role).toBe('user')
      expect(user.createdAt).toBeInstanceOf(Date)
      expect(user.updatedAt).toBeInstanceOf(Date)
    })

    it('should hash the password when creating user', async () => {
      // Arrange
      const userData = createUserData({
        email: 'test@example.com',
        passwordHash: 'plaintext-password'
      })

      // Act
      const user = await userService.createUser(userData)

      // Assert
      expect(user.passwordHash).not.toBe('plaintext-password')
      expect(user.passwordHash).toMatch(/^\$2[aby]\$/)
    })

    it('should throw ConflictError for duplicate email', async () => {
      // Arrange
      const userData = createUserData({
        email: 'duplicate@example.com'
      })

      // Act & Assert
      await userService.createUser(userData)
      await expect(userService.createUser(userData)).rejects.toThrow(ConflictError)
    })

    it('should validate email format', async () => {
      // Arrange
      const userData = createUserData({
        email: 'invalid-email'
      })

      // Act & Assert
      await expect(userService.createUser(userData)).rejects.toThrow(ValidationError)
    })

    it('should validate required fields', async () => {
      // Act & Assert
      await expect(userService.createUser({} as any)).rejects.toThrow(ValidationError)
    })
  })

  describe('getUserById', () => {
    it('should return user by id', async () => {
      // Arrange
      const userData = createUserData()
      const createdUser = await userService.createUser(userData)

      // Act
      const user = await userService.getUserById(createdUser.id)

      // Assert
      expect(user).toBeDefined()
      expect(user!.id).toBe(createdUser.id)
      expect(user!.email).toBe(userData.email)
    })

    it('should return null for non-existent user', async () => {
      // Act
      const user = await userService.getUserById('non-existent-id')

      // Assert
      expect(user).toBeNull()
    })
  })

  describe('getUserByEmail', () => {
    it('should return user by email', async () => {
      // Arrange
      const userData = createUserData({
        email: 'test@example.com'
      })
      await userService.createUser(userData)

      // Act
      const user = await userService.getUserByEmail('test@example.com')

      // Assert
      expect(user).toBeDefined()
      expect(user!.email).toBe('test@example.com')
    })

    it('should return null for non-existent email', async () => {
      // Act
      const user = await userService.getUserByEmail('nonexistent@example.com')

      // Assert
      expect(user).toBeNull()
    })
  })

  describe('updateUser', () => {
    it('should update user successfully', async () => {
      // Arrange
      const userData = createUserData()
      const createdUser = await userService.createUser(userData)
      const updateData = {
        name: 'Updated Name',
        role: 'admin' as const
      }

      // Act
      const updatedUser = await userService.updateUser(createdUser.id, updateData)

      // Assert
      expect(updatedUser.name).toBe('Updated Name')
      expect(updatedUser.role).toBe('admin')
      expect(updatedUser.updatedAt.getTime()).toBeGreaterThan(createdUser.updatedAt.getTime())
    })

    it('should throw NotFoundError for non-existent user', async () => {
      // Act & Assert
      await expect(
        userService.updateUser('non-existent-id', { name: 'New Name' })
      ).rejects.toThrow(NotFoundError)
    })

    it('should validate email format when updating', async () => {
      // Arrange
      const userData = createUserData()
      const createdUser = await userService.createUser(userData)

      // Act & Assert
      await expect(
        userService.updateUser(createdUser.id, { email: 'invalid-email' })
      ).rejects.toThrow(ValidationError)
    })
  })

  describe('deleteUser', () => {
    it('should delete user successfully', async () => {
      // Arrange
      const userData = createUserData()
      const createdUser = await userService.createUser(userData)

      // Act
      await userService.deleteUser(createdUser.id)

      // Assert
      const deletedUser = await userService.getUserById(createdUser.id)
      expect(deletedUser).toBeNull()
    })

    it('should throw NotFoundError for non-existent user', async () => {
      // Act & Assert
      await expect(userService.deleteUser('non-existent-id')).rejects.toThrow(NotFoundError)
    })
  })

  describe('authenticate', () => {
    it('should authenticate user with correct credentials', async () => {
      // Arrange
      const password = 'test-password'
      const userData = createUserData({
        email: 'test@example.com',
        passwordHash: password
      })
      await userService.createUser(userData)

      // Act
      const result = await userService.authenticate('test@example.com', password)

      // Assert
      expect(result.success).toBe(true)
      expect(result.user).toBeDefined()
      expect(result.user!.email).toBe('test@example.com')
      expect(result.token).toBeDefined()
    })

    it('should fail authentication with wrong password', async () => {
      // Arrange
      const userData = createUserData({
        email: 'test@example.com',
        passwordHash: 'correct-password'
      })
      await userService.createUser(userData)

      // Act
      const result = await userService.authenticate('test@example.com', 'wrong-password')

      // Assert
      expect(result.success).toBe(false)
      expect(result.user).toBeNull()
      expect(result.token).toBeNull()
    })

    it('should fail authentication for non-existent user', async () => {
      // Act
      const result = await userService.authenticate('nonexistent@example.com', 'password')

      // Assert
      expect(result.success).toBe(false)
      expect(result.user).toBeNull()
      expect(result.token).toBeNull()
    })
  })

  describe('API Key Management', () => {
    let testUser: any

    beforeEach(async () => {
      const userData = createUserData()
      testUser = await userService.createUser(userData)
    })

    it('should generate API key successfully', async () => {
      // Act
      const apiKey = await userService.generateApiKey(testUser.id, 'Test API Key')

      // Assert
      expect(apiKey).toBeDefined()
      expect(apiKey.id).toBeDefined()
      expect(apiKey.userId).toBe(testUser.id)
      expect(apiKey.name).toBe('Test API Key')
      expect(apiKey.key).toMatch(/^ak_/)
      expect(apiKey.keyHash).toBeDefined()
      expect(apiKey.keyHash).not.toBe(apiKey.key)
    })

    it('should validate API key successfully', async () => {
      // Arrange
      const apiKey = await userService.generateApiKey(testUser.id, 'Test API Key')

      // Act
      const user = await userService.validateApiKey(apiKey.key)

      // Assert
      expect(user).toBeDefined()
      expect(user!.id).toBe(testUser.id)
    })

    it('should return null for invalid API key', async () => {
      // Act
      const user = await userService.validateApiKey('invalid-key')

      // Assert
      expect(user).toBeNull()
    })

    it('should list user API keys', async () => {
      // Arrange
      await userService.generateApiKey(testUser.id, 'Key 1')
      await userService.generateApiKey(testUser.id, 'Key 2')

      // Act
      const apiKeys = await userService.listApiKeys(testUser.id)

      // Assert
      expect(apiKeys).toHaveLength(2)
      expect(apiKeys[0].name).toBe('Key 1')
      expect(apiKeys[1].name).toBe('Key 2')
    })

    it('should revoke API key successfully', async () => {
      // Arrange
      const apiKey = await userService.generateApiKey(testUser.id, 'Test API Key')

      // Act
      await userService.revokeApiKey(apiKey.id)

      // Assert
      const user = await userService.validateApiKey(apiKey.key)
      expect(user).toBeNull()
    })
  })

  describe('Permission Management', () => {
    let testUser: any
    let projectId: string

    beforeEach(async () => {
      const userData = createUserData()
      testUser = await userService.createUser(userData)
      projectId = 'test-project-id'
    })

    it('should check user permissions', async () => {
      // Arrange
      await userService.grantPermission(testUser.id, projectId, 'editor')

      // Act
      const hasPermission = await userService.checkPermission(testUser.id, projectId, 'read')

      // Assert
      expect(hasPermission).toBe(true)
    })

    it('should grant permission successfully', async () => {
      // Act
      await userService.grantPermission(testUser.id, projectId, 'admin')

      // Assert
      const hasPermission = await userService.checkPermission(testUser.id, projectId, 'admin')
      expect(hasPermission).toBe(true)
    })

    it('should revoke permission successfully', async () => {
      // Arrange
      await userService.grantPermission(testUser.id, projectId, 'editor')

      // Act
      await userService.revokePermission(testUser.id, projectId)

      // Assert
      const hasPermission = await userService.checkPermission(testUser.id, projectId, 'read')
      expect(hasPermission).toBe(false)
    })

    it('should list user permissions', async () => {
      // Arrange
      await userService.grantPermission(testUser.id, projectId, 'editor')
      await userService.grantPermission(testUser.id, 'another-project', 'viewer')

      // Act
      const permissions = await userService.listUserPermissions(testUser.id)

      // Assert
      expect(permissions).toHaveLength(2)
      expect(permissions.some(p => p.projectId === projectId && p.role === 'editor')).toBe(true)
      expect(permissions.some(p => p.projectId === 'another-project' && p.role === 'viewer')).toBe(true)
    })
  })

  describe('User Listing and Search', () => {
    beforeEach(async () => {
      // Create multiple test users
      await userService.createUser(createUserData({
        email: 'user1@example.com',
        name: 'User One',
        role: 'user'
      }))
      await userService.createUser(createUserData({
        email: 'user2@example.com',
        name: 'User Two',
        role: 'admin'
      }))
      await userService.createUser(createUserData({
        email: 'user3@example.com',
        name: 'User Three',
        role: 'user'
      }))
    })

    it('should list all users', async () => {
      // Act
      const users = await userService.listUsers()

      // Assert
      expect(users).toHaveLength(3)
      expect(users.every(u => u.passwordHash === undefined)).toBe(true) // Passwords should be excluded
    })

    it('should list users with pagination', async () => {
      // Act
      const page1 = await userService.listUsers({ limit: 2, offset: 0 })
      const page2 = await userService.listUsers({ limit: 2, offset: 2 })

      // Assert
      expect(page1).toHaveLength(2)
      expect(page2).toHaveLength(1)
    })

    it('should filter users by role', async () => {
      // Act
      const adminUsers = await userService.listUsers({ role: 'admin' })
      const regularUsers = await userService.listUsers({ role: 'user' })

      // Assert
      expect(adminUsers).toHaveLength(1)
      expect(regularUsers).toHaveLength(2)
      expect(adminUsers[0].role).toBe('admin')
    })

    it('should search users by email', async () => {
      // Act
      const users = await userService.searchUsers('user1@example.com')

      // Assert
      expect(users).toHaveLength(1)
      expect(users[0].email).toBe('user1@example.com')
    })

    it('should search users by name', async () => {
      // Act
      const users = await userService.searchUsers('User Two')

      // Assert
      expect(users).toHaveLength(1)
      expect(users[0].name).toBe('User Two')
    })
  })

  describe('Password Management', () => {
    let testUser: any

    beforeEach(async () => {
      const userData = createUserData({
        passwordHash: 'old-password'
      })
      testUser = await userService.createUser(userData)
    })

    it('should change password successfully', async () => {
      // Act
      await userService.changePassword(testUser.id, 'old-password', 'new-password')

      // Assert
      const result = await userService.authenticate(testUser.email, 'new-password')
      expect(result.success).toBe(true)
    })

    it('should fail to change password with wrong current password', async () => {
      // Act & Assert
      await expect(
        userService.changePassword(testUser.id, 'wrong-password', 'new-password')
      ).rejects.toThrow(ValidationError)
    })

    it('should reset password successfully', async () => {
      // Act
      await userService.resetPassword(testUser.id, 'reset-password')

      // Assert
      const result = await userService.authenticate(testUser.email, 'reset-password')
      expect(result.success).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Arrange
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockRejectedValue(new Error('Database error')),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockRejectedValue(new Error('Database error'))
      }
      
      const brokenDbManager = {
        getDb: () => mockDb,
        getSchema: () => ({ users: {}, apiKeys: {}, projectPermissions: {} })
      } as any

      const brokenUserService = new UserService(brokenDbManager, cryptoService, auditService)

      // Act & Assert
      await expect(brokenUserService.getUserById('test-id')).rejects.toThrow('Database error')
    })
  })
})