import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Hono } from 'hono'
import request from 'supertest'
import { jwtAuthMiddleware, apiKeyAuthMiddleware, requireAuth } from './auth.middleware'
import { UserService } from '../services/user.service'
import { CryptoService } from '../services/crypto.service'
import { AuditService } from '../services/audit.service'
import { DatabaseManager } from '../db'
import { createIsolatedTestDb } from '../../test/setup'
import { createUser } from '../../test/factories'
import jwt from 'jsonwebtoken'

describe('Auth Middleware', () => {
  let app: Hono
  let userService: UserService
  let cryptoService: CryptoService
  let auditService: AuditService
  let dbManager: DatabaseManager
  let testUser: any
  let testApiKey: any

  beforeEach(async () => {
    // Create isolated test database
    dbManager = await createIsolatedTestDb()
    await dbManager.runMigrations({ force: true })
    
    // Initialize services
    cryptoService = new CryptoService(dbManager)
    await cryptoService.initialize()
    
    auditService = new AuditService(dbManager)
    userService = new UserService(dbManager, cryptoService, auditService)
    
    // Create test user and API key
    testUser = await userService.createUser({
      email: 'test@example.com',
      name: 'Test User',
      passwordHash: 'password123',
      role: 'user'
    })
    
    testApiKey = await userService.generateApiKey(testUser.id, 'Test API Key')
    
    // Create fresh Hono app for each test
    app = new Hono()
  })

  afterEach(async () => {
    if (dbManager?.isReady()) {
      await dbManager.close()
    }
  })

  describe('JWT Auth Middleware', () => {
    it('should allow access with valid JWT token', async () => {
      // Arrange
      const token = jwt.sign(
        { userId: testUser.id, email: testUser.email },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      )
      
      app.use('*', jwtAuthMiddleware(userService))
      app.get('/protected', (c) => c.json({ message: 'success', user: c.get('user') }))

      // Act
      const response = await request(app.fetch)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`)

      // Assert
      expect(response.status).toBe(200)
      expect(response.body.message).toBe('success')
      expect(response.body.user.id).toBe(testUser.id)
    })

    it('should reject request without token', async () => {
      // Arrange
      app.use('*', jwtAuthMiddleware(userService))
      app.get('/protected', (c) => c.json({ message: 'success' }))

      // Act
      const response = await request(app.fetch)
        .get('/protected')

      // Assert
      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('AUTH_001')
    })

    it('should reject request with invalid token', async () => {
      // Arrange
      app.use('*', jwtAuthMiddleware(userService))
      app.get('/protected', (c) => c.json({ message: 'success' }))

      // Act
      const response = await request(app.fetch)
        .get('/protected')
        .set('Authorization', 'Bearer invalid-token')

      // Assert
      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('AUTH_002')
    })

    it('should reject request with expired token', async () => {
      // Arrange
      const expiredToken = jwt.sign(
        { userId: testUser.id, email: testUser.email },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '-1h' } // Expired 1 hour ago
      )
      
      app.use('*', jwtAuthMiddleware(userService))
      app.get('/protected', (c) => c.json({ message: 'success' }))

      // Act
      const response = await request(app.fetch)
        .get('/protected')
        .set('Authorization', `Bearer ${expiredToken}`)

      // Assert
      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('AUTH_003')
    })

    it('should reject request for non-existent user', async () => {
      // Arrange
      const token = jwt.sign(
        { userId: 'non-existent-user-id', email: 'nonexistent@example.com' },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      )
      
      app.use('*', jwtAuthMiddleware(userService))
      app.get('/protected', (c) => c.json({ message: 'success' }))

      // Act
      const response = await request(app.fetch)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`)

      // Assert
      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('AUTH_001')
    })
  })

  describe('API Key Auth Middleware', () => {
    it('should allow access with valid API key', async () => {
      // Arrange
      app.use('*', apiKeyAuthMiddleware(userService))
      app.get('/api/data', (c) => c.json({ message: 'success', user: c.get('user') }))

      // Act
      const response = await request(app.fetch)
        .get('/api/data')
        .set('X-API-Key', testApiKey.key)

      // Assert
      expect(response.status).toBe(200)
      expect(response.body.message).toBe('success')
      expect(response.body.user.id).toBe(testUser.id)
    })

    it('should reject request without API key', async () => {
      // Arrange
      app.use('*', apiKeyAuthMiddleware(userService))
      app.get('/api/data', (c) => c.json({ message: 'success' }))

      // Act
      const response = await request(app.fetch)
        .get('/api/data')

      // Assert
      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('AUTH_004')
    })

    it('should reject request with invalid API key', async () => {
      // Arrange
      app.use('*', apiKeyAuthMiddleware(userService))
      app.get('/api/data', (c) => c.json({ message: 'success' }))

      // Act
      const response = await request(app.fetch)
        .get('/api/data')
        .set('X-API-Key', 'invalid-api-key')

      // Assert
      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('AUTH_004')
    })

    it('should update last used timestamp for API key', async () => {
      // Arrange
      app.use('*', apiKeyAuthMiddleware(userService))
      app.get('/api/data', (c) => c.json({ message: 'success' }))

      // Act
      await request(app.fetch)
        .get('/api/data')
        .set('X-API-Key', testApiKey.key)

      // Assert
      const apiKeys = await userService.listApiKeys(testUser.id)
      const usedKey = apiKeys.find(k => k.id === testApiKey.id)
      expect(usedKey?.lastUsedAt).toBeDefined()
    })
  })

  describe('Require Auth Middleware', () => {
    it('should allow access for authenticated user', async () => {
      // Arrange
      const token = jwt.sign(
        { userId: testUser.id, email: testUser.email },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      )
      
      app.use('*', jwtAuthMiddleware(userService))
      app.use('*', requireAuth())
      app.get('/protected', (c) => c.json({ message: 'success' }))

      // Act
      const response = await request(app.fetch)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`)

      // Assert
      expect(response.status).toBe(200)
      expect(response.body.message).toBe('success')
    })

    it('should reject access for unauthenticated user', async () => {
      // Arrange
      app.use('*', requireAuth())
      app.get('/protected', (c) => c.json({ message: 'success' }))

      // Act
      const response = await request(app.fetch)
        .get('/protected')

      // Assert
      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('AUTH_001')
    })
  })

  describe('Role-based Authorization', () => {
    let adminUser: any

    beforeEach(async () => {
      adminUser = await userService.createUser({
        email: 'admin@example.com',
        name: 'Admin User',
        passwordHash: 'password123',
        role: 'admin'
      })
    })

    it('should allow admin access to admin-only routes', async () => {
      // Arrange
      const token = jwt.sign(
        { userId: adminUser.id, email: adminUser.email },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      )
      
      app.use('*', jwtAuthMiddleware(userService))
      app.use('*', requireAuth(['admin']))
      app.get('/admin', (c) => c.json({ message: 'admin access granted' }))

      // Act
      const response = await request(app.fetch)
        .get('/admin')
        .set('Authorization', `Bearer ${token}`)

      // Assert
      expect(response.status).toBe(200)
      expect(response.body.message).toBe('admin access granted')
    })

    it('should deny regular user access to admin-only routes', async () => {
      // Arrange
      const token = jwt.sign(
        { userId: testUser.id, email: testUser.email },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      )
      
      app.use('*', jwtAuthMiddleware(userService))
      app.use('*', requireAuth(['admin']))
      app.get('/admin', (c) => c.json({ message: 'admin access granted' }))

      // Act
      const response = await request(app.fetch)
        .get('/admin')
        .set('Authorization', `Bearer ${token}`)

      // Assert
      expect(response.status).toBe(403)
      expect(response.body.error.code).toBe('AUTHZ_002')
    })

    it('should allow multiple roles access', async () => {
      // Arrange
      const userToken = jwt.sign(
        { userId: testUser.id, email: testUser.email },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      )
      
      const adminToken = jwt.sign(
        { userId: adminUser.id, email: adminUser.email },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      )
      
      app.use('*', jwtAuthMiddleware(userService))
      app.use('*', requireAuth(['user', 'admin']))
      app.get('/multi-role', (c) => c.json({ message: 'multi-role access granted' }))

      // Act
      const userResponse = await request(app.fetch)
        .get('/multi-role')
        .set('Authorization', `Bearer ${userToken}`)
        
      const adminResponse = await request(app.fetch)
        .get('/multi-role')
        .set('Authorization', `Bearer ${adminToken}`)

      // Assert
      expect(userResponse.status).toBe(200)
      expect(adminResponse.status).toBe(200)
    })
  })

  describe('Mixed Authentication', () => {
    it('should work with both JWT and API key authentication', async () => {
      // Arrange
      const token = jwt.sign(
        { userId: testUser.id, email: testUser.email },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      )
      
      app.use('*', jwtAuthMiddleware(userService))
      app.use('*', apiKeyAuthMiddleware(userService))
      app.get('/mixed', (c) => c.json({ message: 'success', user: c.get('user') }))

      // Act - Test JWT
      const jwtResponse = await request(app.fetch)
        .get('/mixed')
        .set('Authorization', `Bearer ${token}`)
        
      // Act - Test API Key
      const apiKeyResponse = await request(app.fetch)
        .get('/mixed')
        .set('X-API-Key', testApiKey.key)

      // Assert
      expect(jwtResponse.status).toBe(200)
      expect(jwtResponse.body.user.id).toBe(testUser.id)
      
      expect(apiKeyResponse.status).toBe(200)
      expect(apiKeyResponse.body.user.id).toBe(testUser.id)
    })
  })

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      // Arrange
      const mockUserService = {
        getUserById: vi.fn().mockRejectedValue(new Error('Service error')),
        validateApiKey: vi.fn().mockRejectedValue(new Error('Service error'))
      } as any
      
      const token = jwt.sign(
        { userId: testUser.id, email: testUser.email },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      )
      
      app.use('*', jwtAuthMiddleware(mockUserService))
      app.get('/error-test', (c) => c.json({ message: 'success' }))

      // Act
      const response = await request(app.fetch)
        .get('/error-test')
        .set('Authorization', `Bearer ${token}`)

      // Assert
      expect(response.status).toBe(500)
      expect(response.body.error.code).toBe('SYS_001')
    })
  })
})