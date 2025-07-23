import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import request from 'supertest'
import { environmentRoutes } from './environment.routes'
import { EnvironmentVariableService } from '../services/environment.service'
import { ProjectService } from '../services/project.service'
import { UserService } from '../services/user.service'
import { CryptoService } from '../services/crypto.service'
import { AuditService } from '../services/audit.service'
import { DatabaseManager } from '../db'
import { createIsolatedTestDb } from '../../test/setup'
import { createUser, createProject, createEnvironment } from '../../test/factories'
import jwt from 'jsonwebtoken'

describe('Environment Routes', () => {
  let app: Hono
  let environmentService: EnvironmentVariableService
  let projectService: ProjectService
  let userService: UserService
  let cryptoService: CryptoService
  let auditService: AuditService
  let dbManager: DatabaseManager
  let testUser: any
  let testProject: any
  let testEnvironment: any
  let authToken: string

  beforeEach(async () => {
    // Create isolated test database
    dbManager = await createIsolatedTestDb()
    await dbManager.runMigrations({ force: true })
    
    // Initialize services
    cryptoService = new CryptoService(dbManager)
    await cryptoService.initialize()
    
    auditService = new AuditService(dbManager)
    userService = new UserService(dbManager, cryptoService, auditService)
    projectService = new ProjectService(dbManager, auditService)
    environmentService = new EnvironmentVariableService(dbManager, cryptoService, auditService)
    
    // Create test user
    testUser = await userService.createUser({
      email: 'user@example.com',
      name: 'Test User',
      passwordHash: 'password123',
      role: 'user'
    })
    
    // Create test project and environment
    testProject = await projectService.createProject({
      name: 'Test Project',
      description: 'A test project',
      ownerId: testUser.id
    })
    
    testEnvironment = await projectService.createEnvironment(testProject.id, {
      name: 'development'
    })
    
    // Generate auth token
    authToken = jwt.sign(
      { userId: testUser.id, email: testUser.email },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    )
    
    // Create Hono app with routes
    app = new Hono()
    app.route('/api/environments', environmentRoutes(environmentService, projectService, userService))
  })

  afterEach(async () => {
    if (dbManager?.isReady()) {
      await dbManager.close()
    }
  })

  describe('GET /api/environments/:envId/variables', () => {
    beforeEach(async () => {
      // Create test environment variables
      await environmentService.setVariable(testEnvironment.id, 'DATABASE_URL', 'postgresql://localhost:5432/test', {
        sensitive: true
      })
      await environmentService.setVariable(testEnvironment.id, 'NODE_ENV', 'development', {
        sensitive: false
      })
      await environmentService.setVariable(testEnvironment.id, 'API_KEY', 'secret-api-key', {
        sensitive: true
      })
    })

    it('should return environment variables for authorized user', async () => {
      // Act
      const response = await request(app.fetch)
        .get(`/api/environments/${testEnvironment.id}/variables`)
        .set('Authorization', `Bearer ${authToken}`)

      // Assert
      expect(response.status).toBe(200)
      expect(response.body.variables).toBeDefined()
      expect(response.body.variables.length).toBe(3)
      expect(response.body.variables.some((v: any) => v.key === 'DATABASE_URL')).toBe(true)
      expect(response.body.variables.some((v: any) => v.key === 'NODE_ENV')).toBe(true)
      expect(response.body.variables.some((v: any) => v.key === 'API_KEY')).toBe(true)
    })

    it('should mask sensitive variables by default', async () => {
      // Act
      const response = await request(app.fetch)
        .get(`/api/environments/${testEnvironment.id}/variables`)
        .set('Authorization', `Bearer ${authToken}`)

      // Assert
      expect(response.status).toBe(200)
      const sensitiveVar = response.body.variables.find((v: any) => v.key === 'DATABASE_URL')
      expect(sensitiveVar.value).toBe('***')
      expect(sensitiveVar.sensitive).toBe(true)
    })

    it('should show full values when requested', async () => {
      // Act
      const response = await request(app.fetch)
        .get(`/api/environments/${testEnvironment.id}/variables?showValues=true`)
        .set('Authorization', `Bearer ${authToken}`)

      // Assert
      expect(response.status).toBe(200)
      const sensitiveVar = response.body.variables.find((v: any) => v.key === 'DATABASE_URL')
      expect(sensitiveVar.value).toBe('postgresql://localhost:5432/test')
    })

    it('should return 404 for non-existent environment', async () => {
      // Act
      const response = await request(app.fetch)
        .get('/api/environments/non-existent-id/variables')
        .set('Authorization', `Bearer ${authToken}`)

      // Assert
      expect(response.status).toBe(404)
      expect(response.body.error.code).toBe('RES_001')
    })

    it('should require authentication', async () => {
      // Act
      const response = await request(app.fetch)
        .get(`/api/environments/${testEnvironment.id}/variables`)

      // Assert
      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('AUTH_001')
    })
  })

  describe('POST /api/environments/:envId/variables', () => {
    it('should create new environment variable', async () => {
      // Arrange
      const variableData = {
        key: 'NEW_VARIABLE',
        value: 'new-value',
        sensitive: false,
        description: 'A new test variable'
      }

      // Act
      const response = await request(app.fetch)
        .post(`/api/environments/${testEnvironment.id}/variables`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(variableData)

      // Assert
      expect(response.status).toBe(201)
      expect(response.body.variable).toBeDefined()
      expect(response.body.variable.key).toBe('NEW_VARIABLE')
      expect(response.body.variable.value).toBe('new-value')
      expect(response.body.variable.sensitive).toBe(false)
      expect(response.body.variable.description).toBe('A new test variable')
    })

    it('should create sensitive variable with encryption', async () => {
      // Arrange
      const variableData = {
        key: 'SECRET_KEY',
        value: 'super-secret-value',
        sensitive: true
      }

      // Act
      const response = await request(app.fetch)
        .post(`/api/environments/${testEnvironment.id}/variables`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(variableData)

      // Assert
      expect(response.status).toBe(201)
      expect(response.body.variable.sensitive).toBe(true)
      expect(response.body.variable.encrypted).toBe(true)
    })

    it('should validate required fields', async () => {
      // Act
      const response = await request(app.fetch)
        .post(`/api/environments/${testEnvironment.id}/variables`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})

      // Assert
      expect(response.status).toBe(400)
      expect(response.body.error.code).toBe('VALID_002')
    })

    it('should validate variable key format', async () => {
      // Act
      const response = await request(app.fetch)
        .post(`/api/environments/${testEnvironment.id}/variables`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          key: 'invalid-key-with-spaces and symbols!',
          value: 'test-value'
        })

      // Assert
      expect(response.status).toBe(400)
      expect(response.body.error.code).toBe('VALID_002')
    })

    it('should prevent duplicate keys', async () => {
      // Arrange
      await environmentService.setVariable(testEnvironment.id, 'EXISTING_VAR', 'existing-value')

      // Act
      const response = await request(app.fetch)
        .post(`/api/environments/${testEnvironment.id}/variables`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          key: 'EXISTING_VAR',
          value: 'new-value'
        })

      // Assert
      expect(response.status).toBe(409)
      expect(response.body.error.code).toBe('RES_002')
    })

    it('should require authentication', async () => {
      // Act
      const response = await request(app.fetch)
        .post(`/api/environments/${testEnvironment.id}/variables`)
        .send({ key: 'TEST', value: 'test' })

      // Assert
      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('AUTH_001')
    })
  })

  describe('PUT /api/environments/:envId/variables/:key', () => {
    beforeEach(async () => {
      await environmentService.setVariable(testEnvironment.id, 'TEST_VAR', 'original-value')
    })

    it('should update existing variable', async () => {
      // Arrange
      const updateData = {
        value: 'updated-value',
        description: 'Updated description'
      }

      // Act
      const response = await request(app.fetch)
        .put(`/api/environments/${testEnvironment.id}/variables/TEST_VAR`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)

      // Assert
      expect(response.status).toBe(200)
      expect(response.body.variable.value).toBe('updated-value')
      expect(response.body.variable.description).toBe('Updated description')
    })

    it('should update sensitivity setting', async () => {
      // Act
      const response = await request(app.fetch)
        .put(`/api/environments/${testEnvironment.id}/variables/TEST_VAR`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          value: 'sensitive-value',
          sensitive: true
        })

      // Assert
      expect(response.status).toBe(200)
      expect(response.body.variable.sensitive).toBe(true)
      expect(response.body.variable.encrypted).toBe(true)
    })

    it('should return 404 for non-existent variable', async () => {
      // Act
      const response = await request(app.fetch)
        .put(`/api/environments/${testEnvironment.id}/variables/NON_EXISTENT`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ value: 'new-value' })

      // Assert
      expect(response.status).toBe(404)
      expect(response.body.error.code).toBe('RES_001')
    })

    it('should require authentication', async () => {
      // Act
      const response = await request(app.fetch)
        .put(`/api/environments/${testEnvironment.id}/variables/TEST_VAR`)
        .send({ value: 'new-value' })

      // Assert
      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('AUTH_001')
    })
  })

  describe('DELETE /api/environments/:envId/variables/:key', () => {
    beforeEach(async () => {
      await environmentService.setVariable(testEnvironment.id, 'DELETE_ME', 'delete-value')
    })

    it('should delete existing variable', async () => {
      // Act
      const response = await request(app.fetch)
        .delete(`/api/environments/${testEnvironment.id}/variables/DELETE_ME`)
        .set('Authorization', `Bearer ${authToken}`)

      // Assert
      expect(response.status).toBe(200)
      expect(response.body.message).toBeDefined()
    })

    it('should return 404 for non-existent variable', async () => {
      // Act
      const response = await request(app.fetch)
        .delete(`/api/environments/${testEnvironment.id}/variables/NON_EXISTENT`)
        .set('Authorization', `Bearer ${authToken}`)

      // Assert
      expect(response.status).toBe(404)
      expect(response.body.error.code).toBe('RES_001')
    })

    it('should require authentication', async () => {
      // Act
      const response = await request(app.fetch)
        .delete(`/api/environments/${testEnvironment.id}/variables/DELETE_ME`)

      // Assert
      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('AUTH_001')
    })
  })

  describe('POST /api/environments/:envId/variables/batch', () => {
    it('should create multiple variables at once', async () => {
      // Arrange
      const batchData = {
        variables: [
          { key: 'BATCH_VAR_1', value: 'value1', sensitive: false },
          { key: 'BATCH_VAR_2', value: 'value2', sensitive: true },
          { key: 'BATCH_VAR_3', value: 'value3', sensitive: false }
        ]
      }

      // Act
      const response = await request(app.fetch)
        .post(`/api/environments/${testEnvironment.id}/variables/batch`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(batchData)

      // Assert
      expect(response.status).toBe(201)
      expect(response.body.variables).toBeDefined()
      expect(response.body.variables.length).toBe(3)
      expect(response.body.created).toBe(3)
      expect(response.body.updated).toBe(0)
    })

    it('should update existing variables in batch', async () => {
      // Arrange
      await environmentService.setVariable(testEnvironment.id, 'EXISTING_VAR', 'old-value')
      
      const batchData = {
        variables: [
          { key: 'EXISTING_VAR', value: 'new-value', sensitive: false },
          { key: 'NEW_VAR', value: 'new-value', sensitive: false }
        ]
      }

      // Act
      const response = await request(app.fetch)
        .post(`/api/environments/${testEnvironment.id}/variables/batch`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(batchData)

      // Assert
      expect(response.status).toBe(201)
      expect(response.body.created).toBe(1)
      expect(response.body.updated).toBe(1)
    })

    it('should validate batch data', async () => {
      // Act
      const response = await request(app.fetch)
        .post(`/api/environments/${testEnvironment.id}/variables/batch`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ variables: [] })

      // Assert
      expect(response.status).toBe(400)
      expect(response.body.error.code).toBe('VALID_002')
    })

    it('should require authentication', async () => {
      // Act
      const response = await request(app.fetch)
        .post(`/api/environments/${testEnvironment.id}/variables/batch`)
        .send({ variables: [{ key: 'TEST', value: 'test' }] })

      // Assert
      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('AUTH_001')
    })
  })

  describe('GET /api/environments/:envId/export', () => {
    beforeEach(async () => {
      await environmentService.setVariable(testEnvironment.id, 'EXPORT_VAR_1', 'value1')
      await environmentService.setVariable(testEnvironment.id, 'EXPORT_VAR_2', 'value2', { sensitive: true })
    })

    it('should export variables in env format', async () => {
      // Act
      const response = await request(app.fetch)
        .get(`/api/environments/${testEnvironment.id}/export?format=env`)
        .set('Authorization', `Bearer ${authToken}`)

      // Assert
      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('text/plain')
      expect(response.text).toContain('EXPORT_VAR_1=value1')
      expect(response.text).toContain('EXPORT_VAR_2=value2')
    })

    it('should export variables in json format', async () => {
      // Act
      const response = await request(app.fetch)
        .get(`/api/environments/${testEnvironment.id}/export?format=json`)
        .set('Authorization', `Bearer ${authToken}`)

      // Assert
      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('application/json')
      expect(response.body.EXPORT_VAR_1).toBe('value1')
      expect(response.body.EXPORT_VAR_2).toBe('value2')
    })

    it('should use env format by default', async () => {
      // Act
      const response = await request(app.fetch)
        .get(`/api/environments/${testEnvironment.id}/export`)
        .set('Authorization', `Bearer ${authToken}`)

      // Assert
      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('text/plain')
    })

    it('should require authentication', async () => {
      // Act
      const response = await request(app.fetch)
        .get(`/api/environments/${testEnvironment.id}/export`)

      // Assert
      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('AUTH_001')
    })
  })

  describe('POST /api/environments/:envId/import', () => {
    it('should import variables from env format', async () => {
      // Arrange
      const envData = 'IMPORT_VAR_1=value1\nIMPORT_VAR_2=value2\n# Comment line\nIMPORT_VAR_3=value3'

      // Act
      const response = await request(app.fetch)
        .post(`/api/environments/${testEnvironment.id}/import`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'text/plain')
        .send(envData)

      // Assert
      expect(response.status).toBe(200)
      expect(response.body.imported).toBe(3)
      expect(response.body.skipped).toBe(0)
    })

    it('should import variables from json format', async () => {
      // Arrange
      const jsonData = {
        IMPORT_JSON_1: 'value1',
        IMPORT_JSON_2: 'value2'
      }

      // Act
      const response = await request(app.fetch)
        .post(`/api/environments/${testEnvironment.id}/import`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send(jsonData)

      // Assert
      expect(response.status).toBe(200)
      expect(response.body.imported).toBe(2)
    })

    it('should handle conflicts based on strategy', async () => {
      // Arrange
      await environmentService.setVariable(testEnvironment.id, 'CONFLICT_VAR', 'original-value')
      
      const envData = 'CONFLICT_VAR=new-value\nNEW_VAR=new-value'

      // Act - Skip conflicts
      const skipResponse = await request(app.fetch)
        .post(`/api/environments/${testEnvironment.id}/import?conflictStrategy=skip`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'text/plain')
        .send(envData)

      // Assert
      expect(skipResponse.status).toBe(200)
      expect(skipResponse.body.imported).toBe(1)
      expect(skipResponse.body.skipped).toBe(1)
    })

    it('should validate import data', async () => {
      // Act
      const response = await request(app.fetch)
        .post(`/api/environments/${testEnvironment.id}/import`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'text/plain')
        .send('')

      // Assert
      expect(response.status).toBe(400)
      expect(response.body.error.code).toBe('VALID_002')
    })

    it('should require authentication', async () => {
      // Act
      const response = await request(app.fetch)
        .post(`/api/environments/${testEnvironment.id}/import`)
        .send('TEST_VAR=test')

      // Assert
      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('AUTH_001')
    })
  })

  describe('Permission Checks', () => {
    let otherUser: any
    let otherUserToken: string

    beforeEach(async () => {
      // Create another user without access to the project
      otherUser = await userService.createUser({
        email: 'other@example.com',
        name: 'Other User',
        passwordHash: 'password123',
        role: 'user'
      })
      
      otherUserToken = jwt.sign(
        { userId: otherUser.id, email: otherUser.email },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      )
    })

    it('should deny access to users without project permissions', async () => {
      // Act
      const response = await request(app.fetch)
        .get(`/api/environments/${testEnvironment.id}/variables`)
        .set('Authorization', `Bearer ${otherUserToken}`)

      // Assert
      expect(response.status).toBe(403)
      expect(response.body.error.code).toBe('AUTHZ_002')
    })

    it('should allow access after granting permissions', async () => {
      // Arrange
      await userService.grantPermission(otherUser.id, testProject.id, 'viewer')

      // Act
      const response = await request(app.fetch)
        .get(`/api/environments/${testEnvironment.id}/variables`)
        .set('Authorization', `Bearer ${otherUserToken}`)

      // Assert
      expect(response.status).toBe(200)
    })
  })

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      // Arrange - Close database to cause service errors
      await dbManager.close()

      // Act
      const response = await request(app.fetch)
        .get(`/api/environments/${testEnvironment.id}/variables`)
        .set('Authorization', `Bearer ${authToken}`)

      // Assert
      expect(response.status).toBe(500)
      expect(response.body.error.code).toBe('SYS_001')
    })

    it('should validate environment ID format', async () => {
      // Act
      const response = await request(app.fetch)
        .get('/api/environments/invalid-uuid/variables')
        .set('Authorization', `Bearer ${authToken}`)

      // Assert
      expect(response.status).toBe(400)
      expect(response.body.error.code).toBe('VALID_002')
    })
  })
})