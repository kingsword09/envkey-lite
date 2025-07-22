import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { PGlite } from '@electric-sql/pglite'
import { DatabaseManager } from '../db/manager'
import { CryptoService } from '../services/crypto.service'
import { createAuthRoutes } from './auth.routes'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '../db/schema'

describe('Auth Routes Integration Tests', () => {
  let db: PGlite
  let dbManager: DatabaseManager
  let cryptoService: CryptoService
  let app: Hono
  const jwtSecret = 'test-jwt-secret-key-for-testing-only'

  beforeAll(async () => {
    // Create in-memory database for testing
    db = new PGlite()
    
    // Initialize database manager
    dbManager = new DatabaseManager()
    await dbManager.initialize({ database: db })
    
    // Run migrations
    const drizzleDb = drizzle(db, { schema })
    await migrate(drizzleDb, { migrationsFolder: './src/db/migrations' })
    
    // Initialize crypto service
    cryptoService = new CryptoService(dbManager)
    await cryptoService.initialize()
    
    // Create the auth routes app
    app = createAuthRoutes(dbManager, cryptoService, jwtSecret)
  })

  afterAll(async () => {
    await dbManager.close()
    await db.close()
  })

  beforeEach(async () => {
    // Clean up database before each test
    const drizzleDb = dbManager.getDb()
    await drizzleDb.delete(schema.apiKeys)
    await drizzleDb.delete(schema.users)
  })

  describe('POST /register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'SecurePassword123!',
        role: 'user'
      }

      const response = await app.request('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      })

      expect(response.status).toBe(201)
      
      const result = await response.json()
      expect(result.success).toBe(true)
      expect(result.user).toMatchObject({
        email: userData.email,
        name: userData.name,
        role: userData.role
      })
      expect(result.user.id).toBeDefined()
      expect(result.token).toBeDefined()
    })

    it('should reject registration with invalid email', async () => {
      const userData = {
        email: 'invalid-email',
        name: 'Test User',
        password: 'SecurePassword123!'
      }

      const response = await app.request('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      })

      expect(response.status).toBe(400)
      const result = await response.text()
      expect(result).toContain('Invalid email address')
    })

    it('should reject registration with weak password', async () => {
      const userData = {
        email: 'test@example.com',
        name: 'Test User',
        password: '123'
      }

      const response = await app.request('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      })

      expect(response.status).toBe(400)
      const result = await response.text()
      expect(result).toContain('Password must be at least 8 characters long')
    })

    it('should reject registration with duplicate email', async () => {
      const userData = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'SecurePassword123!'
      }

      // First registration
      await app.request('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      })

      // Second registration with same email
      const response = await app.request('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      })

      expect(response.status).toBe(409)
      const result = await response.json()
      expect(result.error.message).toContain('User with this email already exists')
    })
  })

  describe('POST /login', () => {
    beforeEach(async () => {
      // Create a test user for login tests
      await app.request('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          name: 'Test User',
          password: 'SecurePassword123!'
        })
      })
    })

    it('should login successfully with valid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'SecurePassword123!'
      }

      const response = await app.request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData)
      })

      expect(response.status).toBe(200)
      
      const result = await response.json()
      expect(result.success).toBe(true)
      expect(result.user).toMatchObject({
        email: loginData.email,
        name: 'Test User'
      })
      expect(result.token).toBeDefined()
    })

    it('should reject login with invalid password', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'wrongpassword'
      }

      const response = await app.request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData)
      })

      expect(response.status).toBe(401)
      const result = await response.json()
      expect(result.error.message).toContain('Invalid email or password')
    })

    it('should reject login with non-existent email', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'SecurePassword123!'
      }

      const response = await app.request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData)
      })

      expect(response.status).toBe(401)
      const result = await response.json()
      expect(result.error.message).toContain('Invalid email or password')
    })
  })

  describe('GET /me', () => {
    let authToken: string

    beforeEach(async () => {
      // Register and login to get auth token
      const registerResponse = await app.request('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          name: 'Test User',
          password: 'SecurePassword123!'
        })
      })
      
      const registerResult = await registerResponse.json()
      authToken = registerResult.token
    })

    it('should return user profile with valid token', async () => {
      const response = await app.request('/me', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${authToken}` }
      })

      expect(response.status).toBe(200)
      
      const result = await response.json()
      expect(result.success).toBe(true)
      expect(result.user).toMatchObject({
        email: 'test@example.com',
        name: 'Test User',
        role: 'user'
      })
    })

    it('should reject request without auth token', async () => {
      const response = await app.request('/me', {
        method: 'GET'
      })

      expect(response.status).toBe(401)
      const result = await response.json()
      expect(result.error.message).toContain('Authentication required')
    })

    it('should reject request with invalid token', async () => {
      const response = await app.request('/me', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer invalid-token' }
      })

      expect(response.status).toBe(401)
      const result = await response.json()
      expect(result.error.message).toContain('Invalid JWT token')
    })
  })

  describe('PUT /me', () => {
    let authToken: string

    beforeEach(async () => {
      // Register and login to get auth token
      const registerResponse = await app.request('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          name: 'Test User',
          password: 'SecurePassword123!'
        })
      })
      
      const registerResult = await registerResponse.json()
      authToken = registerResult.token
    })

    it('should update user profile successfully', async () => {
      const updateData = {
        name: 'Updated Name',
        email: 'updated@example.com'
      }

      const response = await app.request('/me', {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      })

      expect(response.status).toBe(200)
      
      const result = await response.json()
      expect(result.success).toBe(true)
      expect(result.user).toMatchObject({
        name: updateData.name,
        email: updateData.email
      })
    })

    it('should reject update with invalid email', async () => {
      const updateData = {
        email: 'invalid-email'
      }

      const response = await app.request('/me', {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      })

      expect(response.status).toBe(400)
      const result = await response.text()
      expect(result).toContain('Invalid email address')
    })
  })

  describe('POST /change-password', () => {
    let authToken: string

    beforeEach(async () => {
      // Register and login to get auth token
      const registerResponse = await app.request('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          name: 'Test User',
          password: 'SecurePassword123!'
        })
      })
      
      const registerResult = await registerResponse.json()
      authToken = registerResult.token
    })

    it('should change password successfully', async () => {
      const passwordData = {
        currentPassword: 'SecurePassword123!',
        newPassword: 'NewSecurePassword456!'
      }

      const response = await app.request('/change-password', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(passwordData)
      })

      expect(response.status).toBe(200)
      
      const result = await response.json()
      expect(result.success).toBe(true)
      expect(result.message).toContain('Password changed successfully')
    })

    it('should reject password change with wrong current password', async () => {
      const passwordData = {
        currentPassword: 'wrongpassword',
        newPassword: 'newsecurepassword456'
      }

      const response = await app.request('/change-password', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(passwordData)
      })

      expect(response.status).toBe(400)
      const result = await response.json()
      expect(result.error.message).toContain('Current password is incorrect')
    })

    it('should reject weak new password', async () => {
      const passwordData = {
        currentPassword: 'SecurePassword123!',
        newPassword: '123'
      }

      const response = await app.request('/change-password', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(passwordData)
      })

      expect(response.status).toBe(400)
      const result = await response.text()
      expect(result).toContain('New password must be at least 8 characters long')
    })
  })

  describe('API Key Management', () => {
    let authToken: string

    beforeEach(async () => {
      // Register and login to get auth token
      const registerResponse = await app.request('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          name: 'Test User',
          password: 'SecurePassword123!'
        })
      })
      
      const registerResult = await registerResponse.json()
      authToken = registerResult.token
    })

    describe('POST /api-keys', () => {
      it('should create API key successfully', async () => {
        const keyData = {
          name: 'Test API Key'
        }

        const response = await app.request('/api-keys', {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(keyData)
        })

        expect(response.status).toBe(201)
        
        const result = await response.json()
        expect(result.success).toBe(true)
        expect(result.apiKey).toMatchObject({
          name: keyData.name
        })
        expect(result.apiKey.id).toBeDefined()
        expect(result.apiKey.key).toBeDefined()
        expect(result.apiKey.createdAt).toBeDefined()
      })

      it('should reject API key creation with empty name', async () => {
        const keyData = {
          name: ''
        }

        const response = await app.request('/api-keys', {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(keyData)
        })

        expect(response.status).toBe(400)
        const result = await response.text()
        expect(result).toContain('API key name is required')
      })
    })

    describe('GET /api-keys', () => {
      it('should list user API keys', async () => {
        // Create a test API key first
        await app.request('/api-keys', {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name: 'Test API Key' })
        })

        const response = await app.request('/api-keys', {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${authToken}` }
        })

        expect(response.status).toBe(200)
        
        const result = await response.json()
        expect(result.success).toBe(true)
        expect(Array.isArray(result.apiKeys)).toBe(true)
        expect(result.apiKeys).toHaveLength(1)
        expect(result.apiKeys[0]).toMatchObject({
          name: 'Test API Key'
        })
        // Should not include the actual key value
        expect(result.apiKeys[0].key).toBeUndefined()
      })
    })

    describe('DELETE /api-keys/:keyId', () => {
      it('should delete API key successfully', async () => {
        // Create a test API key first
        const createResponse = await app.request('/api-keys', {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name: 'Test API Key' })
        })
        
        const createResult = await createResponse.json()
        const keyId = createResult.apiKey.id

        const response = await app.request(`/api-keys/${keyId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${authToken}` }
        })

        expect(response.status).toBe(200)
        
        const result = await response.json()
        expect(result.success).toBe(true)
        expect(result.message).toContain('API key deleted successfully')
      })

      it('should return 404 for non-existent API key', async () => {
        const fakeKeyId = '550e8400-e29b-41d4-a716-446655440000'

        const response = await app.request(`/api-keys/${fakeKeyId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${authToken}` }
        })

        expect(response.status).toBe(404)
        const result = await response.json()
        expect(result.error.message).toContain('API key not found')
      })
    })
  })
})