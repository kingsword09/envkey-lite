import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { PGlite } from '@electric-sql/pglite'
import { DatabaseManager } from '../db/manager'
import { CryptoService } from '../services/crypto.service'
import { createProjectRoutes } from './projects.routes'
import { createAuthRoutes } from './auth.routes'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '../db/schema'

describe('Project Routes Integration Tests', () => {
  let db: PGlite
  let dbManager: DatabaseManager
  let cryptoService: CryptoService
  let projectApp: Hono
  let authApp: Hono
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
    
    // Create the project routes app
    projectApp = createProjectRoutes(dbManager, cryptoService, jwtSecret)
    
    // Create auth routes for user registration/login
    authApp = createAuthRoutes(dbManager, cryptoService, jwtSecret)
  })

  afterAll(async () => {
    await dbManager.close()
    await db.close()
  })

  beforeEach(async () => {
    // Clean up database before each test
    const drizzleDb = dbManager.getDb()
    await drizzleDb.delete(schema.projectPermissions)
    await drizzleDb.delete(schema.environmentVariables)
    await drizzleDb.delete(schema.environments)
    await drizzleDb.delete(schema.projects)
    await drizzleDb.delete(schema.apiKeys)
    await drizzleDb.delete(schema.users)
  })

  // Helper function to create a test user and get auth token
  async function createTestUser(email: string = 'test@example.com', role: string = 'user') {
    const registerResponse = await authApp.request('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        name: 'Test User',
        password: 'SecurePassword123!',
        role
      })
    })
    
    const registerResult = await registerResponse.json()
    return {
      user: registerResult.user,
      token: registerResult.token
    }
  }

  describe('POST /', () => {
    it('should create a new project successfully', async () => {
      const { token } = await createTestUser()
      
      const projectData = {
        name: 'Test Project',
        description: 'A test project'
      }

      const response = await projectApp.request('/', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(projectData)
      })

      expect(response.status).toBe(201)
      
      const result = await response.json()
      expect(result.success).toBe(true)
      expect(result.project).toMatchObject({
        name: projectData.name,
        description: projectData.description
      })
      expect(result.project.id).toBeDefined()
      expect(result.project.ownerId).toBeDefined()
    })

    it('should reject project creation with empty name', async () => {
      const { token } = await createTestUser()
      
      const projectData = {
        name: '',
        description: 'A test project'
      }

      const response = await projectApp.request('/', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(projectData)
      })

      expect(response.status).toBe(400)
      const result = await response.json()
      expect(result.error.message).toContain('Project name is required')
    })

    it('should reject project creation without authentication', async () => {
      const projectData = {
        name: 'Test Project',
        description: 'A test project'
      }

      const response = await projectApp.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData)
      })

      expect(response.status).toBe(401)
      const result = await response.json()
      expect(result.error.message).toContain('Authentication required')
    })
  })

  describe('GET /', () => {
    it('should list user projects', async () => {
      const { token } = await createTestUser()
      
      // Create a test project first
      await projectApp.request('/', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: 'Test Project',
          description: 'A test project'
        })
      })

      const response = await projectApp.request('/', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      expect(response.status).toBe(200)
      
      const result = await response.json()
      expect(result.success).toBe(true)
      expect(Array.isArray(result.projects)).toBe(true)
      expect(result.projects).toHaveLength(1)
      expect(result.projects[0]).toMatchObject({
        name: 'Test Project',
        description: 'A test project'
      })
    })

    it('should return empty list for user with no projects', async () => {
      const { token } = await createTestUser()

      const response = await projectApp.request('/', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      expect(response.status).toBe(200)
      
      const result = await response.json()
      expect(result.success).toBe(true)
      expect(Array.isArray(result.projects)).toBe(true)
      expect(result.projects).toHaveLength(0)
    })
  })

  describe('GET /:projectId', () => {
    it('should get a specific project', async () => {
      const { token } = await createTestUser()
      
      // Create a test project first
      const createResponse = await projectApp.request('/', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: 'Test Project',
          description: 'A test project'
        })
      })
      
      const createResult = await createResponse.json()
      const projectId = createResult.project.id

      const response = await projectApp.request(`/${projectId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      expect(response.status).toBe(200)
      
      const result = await response.json()
      expect(result.success).toBe(true)
      expect(result.project).toMatchObject({
        id: projectId,
        name: 'Test Project',
        description: 'A test project'
      })
    })

    it('should return 404 for non-existent project', async () => {
      const { token } = await createTestUser()
      const fakeProjectId = '550e8400-e29b-41d4-a716-446655440000'

      const response = await projectApp.request(`/${fakeProjectId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      expect(response.status).toBe(404)
      const result = await response.json()
      expect(result.error.message).toContain('Project not found')
    })

    it('should deny access to project without permission', async () => {
      const { token: ownerToken } = await createTestUser('owner@example.com')
      const { token: userToken } = await createTestUser('user@example.com')
      
      // Create project as owner
      const createResponse = await projectApp.request('/', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ownerToken}`
        },
        body: JSON.stringify({
          name: 'Private Project',
          description: 'A private project'
        })
      })
      
      const createResult = await createResponse.json()
      const projectId = createResult.project.id

      // Try to access as different user
      const response = await projectApp.request(`/${projectId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${userToken}` }
      })

      expect(response.status).toBe(403)
      const result = await response.json()
      expect(result.error.message).toContain('Access denied')
    })
  })

  describe('PUT /:projectId', () => {
    it('should update a project successfully', async () => {
      const { token } = await createTestUser()
      
      // Create a test project first
      const createResponse = await projectApp.request('/', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: 'Test Project',
          description: 'A test project'
        })
      })
      
      const createResult = await createResponse.json()
      const projectId = createResult.project.id

      const updateData = {
        name: 'Updated Project',
        description: 'An updated project'
      }

      const response = await projectApp.request(`/${projectId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updateData)
      })

      expect(response.status).toBe(200)
      
      const result = await response.json()
      expect(result.success).toBe(true)
      expect(result.project).toMatchObject({
        id: projectId,
        name: updateData.name,
        description: updateData.description
      })
    })

    it('should reject update with empty name', async () => {
      const { token } = await createTestUser()
      
      // Create a test project first
      const createResponse = await projectApp.request('/', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: 'Test Project',
          description: 'A test project'
        })
      })
      
      const createResult = await createResponse.json()
      const projectId = createResult.project.id

      const updateData = {
        name: ''
      }

      const response = await projectApp.request(`/${projectId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updateData)
      })

      expect(response.status).toBe(400)
      const result = await response.json()
      expect(result.error.message).toContain('Project name cannot be empty')
    })
  })

  describe('DELETE /:projectId', () => {
    it('should delete a project successfully', async () => {
      const { token } = await createTestUser()
      
      // Create a test project first
      const createResponse = await projectApp.request('/', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: 'Test Project',
          description: 'A test project'
        })
      })
      
      const createResult = await createResponse.json()
      const projectId = createResult.project.id

      const response = await projectApp.request(`/${projectId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      expect(response.status).toBe(200)
      
      const result = await response.json()
      expect(result.success).toBe(true)
      expect(result.message).toContain('Project deleted successfully')
    })

    it('should deny deletion by non-owner', async () => {
      const { token: ownerToken } = await createTestUser('owner@example.com')
      const { token: userToken } = await createTestUser('user@example.com')
      
      // Create project as owner
      const createResponse = await projectApp.request('/', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ownerToken}`
        },
        body: JSON.stringify({
          name: 'Test Project',
          description: 'A test project'
        })
      })
      
      const createResult = await createResponse.json()
      const projectId = createResult.project.id

      // Try to delete as different user
      const response = await projectApp.request(`/${projectId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${userToken}` }
      })

      expect(response.status).toBe(403)
      const result = await response.json()
      expect(result.error.message).toContain('Only project owners or system admins can delete projects')
    })
  })

  describe('Environment Management', () => {
    let projectId: string
    let authToken: string

    beforeEach(async () => {
      const { token } = await createTestUser()
      authToken = token
      
      // Create a test project
      const createResponse = await projectApp.request('/', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          name: 'Test Project',
          description: 'A test project'
        })
      })
      
      const createResult = await createResponse.json()
      projectId = createResult.project.id
    })

    describe('POST /:projectId/environments', () => {
      it('should create a new environment', async () => {
        const envData = {
          name: 'development'
        }

        const response = await projectApp.request(`/${projectId}/environments`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify(envData)
        })

        expect(response.status).toBe(201)
        
        const result = await response.json()
        expect(result.success).toBe(true)
        expect(result.environment).toMatchObject({
          name: envData.name,
          projectId
        })
        expect(result.environment.id).toBeDefined()
      })

      it('should reject environment creation with empty name', async () => {
        const envData = {
          name: ''
        }

        const response = await projectApp.request(`/${projectId}/environments`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify(envData)
        })

        expect(response.status).toBe(400)
        const result = await response.json()
        expect(result.error.message).toContain('Environment name is required')
      })
    })

    describe('GET /:projectId/environments', () => {
      it('should list project environments', async () => {
        // Create a test environment first
        await projectApp.request(`/${projectId}/environments`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({ name: 'development' })
        })

        const response = await projectApp.request(`/${projectId}/environments`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${authToken}` }
        })

        expect(response.status).toBe(200)
        
        const result = await response.json()
        expect(result.success).toBe(true)
        expect(Array.isArray(result.environments)).toBe(true)
        expect(result.environments).toHaveLength(1)
        expect(result.environments[0]).toMatchObject({
          name: 'development',
          projectId
        })
      })
    })

    describe('GET /:projectId/environments/:environmentId', () => {
      it('should get a specific environment', async () => {
        // Create a test environment first
        const createResponse = await projectApp.request(`/${projectId}/environments`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({ name: 'development' })
        })
        
        const createResult = await createResponse.json()
        const environmentId = createResult.environment.id

        const response = await projectApp.request(`/${projectId}/environments/${environmentId}`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${authToken}` }
        })

        expect(response.status).toBe(200)
        
        const result = await response.json()
        expect(result.success).toBe(true)
        expect(result.environment).toMatchObject({
          id: environmentId,
          name: 'development',
          projectId
        })
      })

      it('should return 404 for non-existent environment', async () => {
        const fakeEnvironmentId = '550e8400-e29b-41d4-a716-446655440000'

        const response = await projectApp.request(`/${projectId}/environments/${fakeEnvironmentId}`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${authToken}` }
        })

        expect(response.status).toBe(404)
        const result = await response.json()
        expect(result.error.message).toContain('Environment not found')
      })
    })

    describe('DELETE /:projectId/environments/:environmentId', () => {
      it('should delete an environment successfully', async () => {
        // Create a test environment first
        const createResponse = await projectApp.request(`/${projectId}/environments`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({ name: 'development' })
        })
        
        const createResult = await createResponse.json()
        const environmentId = createResult.environment.id

        const response = await projectApp.request(`/${projectId}/environments/${environmentId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${authToken}` }
        })

        expect(response.status).toBe(200)
        
        const result = await response.json()
        expect(result.success).toBe(true)
        expect(result.message).toContain('Environment deleted successfully')
      })
    })
  })

  describe('Permission Management', () => {
    let projectId: string
    let ownerToken: string
    let targetUser: any

    beforeEach(async () => {
      const { token } = await createTestUser('owner@example.com')
      ownerToken = token
      
      // Create target user
      const { user } = await createTestUser('target@example.com')
      targetUser = user
      
      // Create a test project
      const createResponse = await projectApp.request('/', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ownerToken}`
        },
        body: JSON.stringify({
          name: 'Test Project',
          description: 'A test project'
        })
      })
      
      const createResult = await createResponse.json()
      projectId = createResult.project.id
    })

    describe('GET /:projectId/permissions', () => {
      it('should list project permissions', async () => {
        const response = await projectApp.request(`/${projectId}/permissions`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${ownerToken}` }
        })

        expect(response.status).toBe(200)
        
        const result = await response.json()
        expect(result.success).toBe(true)
        expect(Array.isArray(result.permissions)).toBe(true)
        // Should have at least the owner permission
        expect(result.permissions.length).toBeGreaterThan(0)
      })
    })

    describe('POST /:projectId/permissions', () => {
      it('should grant permission to a user', async () => {
        const permissionData = {
          userId: targetUser.id,
          role: 'editor'
        }

        const response = await projectApp.request(`/${projectId}/permissions`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ownerToken}`
          },
          body: JSON.stringify(permissionData)
        })

        expect(response.status).toBe(201)
        
        const result = await response.json()
        expect(result.success).toBe(true)
        expect(result.permission).toMatchObject({
          userId: targetUser.id,
          projectId,
          role: 'editor'
        })
      })

      it('should reject invalid role', async () => {
        const permissionData = {
          userId: targetUser.id,
          role: 'invalid-role'
        }

        const response = await projectApp.request(`/${projectId}/permissions`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ownerToken}`
          },
          body: JSON.stringify(permissionData)
        })

        expect(response.status).toBe(400)
        const result = await response.json()
        expect(result.error.message).toContain('Valid role is required')
      })
    })

    describe('DELETE /:projectId/permissions/:userId', () => {
      it('should revoke permission from a user', async () => {
        // First grant permission
        await projectApp.request(`/${projectId}/permissions`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ownerToken}`
          },
          body: JSON.stringify({
            userId: targetUser.id,
            role: 'editor'
          })
        })

        // Then revoke it
        const response = await projectApp.request(`/${projectId}/permissions/${targetUser.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${ownerToken}` }
        })

        expect(response.status).toBe(200)
        
        const result = await response.json()
        expect(result.success).toBe(true)
        expect(result.message).toContain('Permission revoked successfully')
      })
    })
  })
})