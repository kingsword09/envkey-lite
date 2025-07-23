import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import request from 'supertest'
import { auditRoutes } from './audit.routes'
import { AuditService } from '../services/audit.service'
import { UserService } from '../services/user.service'
import { CryptoService } from '../services/crypto.service'
import { DatabaseManager } from '../db'
import { createIsolatedTestDb } from '../../test/setup'
import { createUser, createAuditLog } from '../../test/factories'
import jwt from 'jsonwebtoken'

describe('Audit Routes', () => {
  let app: Hono
  let auditService: AuditService
  let userService: UserService
  let cryptoService: CryptoService
  let dbManager: DatabaseManager
  let testUser: any
  let adminUser: any
  let authToken: string
  let adminToken: string

  beforeEach(async () => {
    // Create isolated test database
    dbManager = await createIsolatedTestDb()
    await dbManager.runMigrations({ force: true })
    
    // Initialize services
    cryptoService = new CryptoService(dbManager)
    await cryptoService.initialize()
    
    auditService = new AuditService(dbManager)
    userService = new UserService(dbManager, cryptoService, auditService)
    
    // Create test users
    testUser = await userService.createUser({
      email: 'user@example.com',
      name: 'Test User',
      passwordHash: 'password123',
      role: 'user'
    })
    
    adminUser = await userService.createUser({
      email: 'admin@example.com',
      name: 'Admin User',
      passwordHash: 'password123',
      role: 'admin'
    })
    
    // Generate auth tokens
    authToken = jwt.sign(
      { userId: testUser.id, email: testUser.email },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    )
    
    adminToken = jwt.sign(
      { userId: adminUser.id, email: adminUser.email },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    )
    
    // Create Hono app with routes
    app = new Hono()
    app.route('/api/audit', auditRoutes(auditService, userService))
  })

  afterEach(async () => {
    if (dbManager?.isReady()) {
      await dbManager.close()
    }
  })

  describe('GET /api/audit/logs', () => {
    beforeEach(async () => {
      // Create some test audit logs
      await auditService.log({
        userId: testUser.id,
        action: 'CREATE',
        resource: 'project',
        resourceId: 'project-1',
        details: { name: 'Test Project' },
        ipAddress: '127.0.0.1',
        userAgent: 'Test Agent'
      })
      
      await auditService.log({
        userId: testUser.id,
        action: 'UPDATE',
        resource: 'environment',
        resourceId: 'env-1',
        details: { key: 'TEST_VAR', value: 'updated' },
        ipAddress: '127.0.0.1',
        userAgent: 'Test Agent'
      })
      
      await auditService.log({
        userId: adminUser.id,
        action: 'DELETE',
        resource: 'user',
        resourceId: 'user-1',
        details: { email: 'deleted@example.com' },
        ipAddress: '192.168.1.1',
        userAgent: 'Admin Agent'
      })
    })

    it('should return audit logs for admin user', async () => {
      // Act
      const response = await request(app.fetch)
        .get('/api/audit/logs')
        .set('Authorization', `Bearer ${adminToken}`)

      // Assert
      expect(response.status).toBe(200)
      expect(response.body.logs).toBeDefined()
      expect(response.body.logs.length).toBeGreaterThan(0)
      expect(response.body.pagination).toBeDefined()
    })

    it('should deny access to regular users', async () => {
      // Act
      const response = await request(app.fetch)
        .get('/api/audit/logs')
        .set('Authorization', `Bearer ${authToken}`)

      // Assert
      expect(response.status).toBe(403)
      expect(response.body.error.code).toBe('AUTHZ_002')
    })

    it('should support pagination', async () => {
      // Act
      const response = await request(app.fetch)
        .get('/api/audit/logs?limit=2&offset=0')
        .set('Authorization', `Bearer ${adminToken}`)

      // Assert
      expect(response.status).toBe(200)
      expect(response.body.logs.length).toBeLessThanOrEqual(2)
      expect(response.body.pagination.limit).toBe(2)
      expect(response.body.pagination.offset).toBe(0)
    })

    it('should filter by user ID', async () => {
      // Act
      const response = await request(app.fetch)
        .get(`/api/audit/logs?userId=${testUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)

      // Assert
      expect(response.status).toBe(200)
      expect(response.body.logs.every((log: any) => log.userId === testUser.id)).toBe(true)
    })

    it('should filter by action', async () => {
      // Act
      const response = await request(app.fetch)
        .get('/api/audit/logs?action=CREATE')
        .set('Authorization', `Bearer ${adminToken}`)

      // Assert
      expect(response.status).toBe(200)
      expect(response.body.logs.every((log: any) => log.action === 'CREATE')).toBe(true)
    })

    it('should filter by resource', async () => {
      // Act
      const response = await request(app.fetch)
        .get('/api/audit/logs?resource=project')
        .set('Authorization', `Bearer ${adminToken}`)

      // Assert
      expect(response.status).toBe(200)
      expect(response.body.logs.every((log: any) => log.resource === 'project')).toBe(true)
    })

    it('should filter by date range', async () => {
      // Arrange
      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // 24 hours ago
      const endDate = new Date().toISOString()

      // Act
      const response = await request(app.fetch)
        .get(`/api/audit/logs?startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${adminToken}`)

      // Assert
      expect(response.status).toBe(200)
      expect(response.body.logs.length).toBeGreaterThan(0)
    })

    it('should handle invalid date filters', async () => {
      // Act
      const response = await request(app.fetch)
        .get('/api/audit/logs?startDate=invalid-date')
        .set('Authorization', `Bearer ${adminToken}`)

      // Assert
      expect(response.status).toBe(400)
      expect(response.body.error.code).toBe('VALID_002')
    })

    it('should require authentication', async () => {
      // Act
      const response = await request(app.fetch)
        .get('/api/audit/logs')

      // Assert
      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('AUTH_001')
    })
  })

  describe('GET /api/audit/logs/:id', () => {
    let testLogId: string

    beforeEach(async () => {
      // Create a test audit log
      await auditService.log({
        userId: testUser.id,
        action: 'CREATE',
        resource: 'project',
        resourceId: 'project-1',
        details: { name: 'Test Project', description: 'A test project' },
        ipAddress: '127.0.0.1',
        userAgent: 'Test Agent'
      })
      
      // Get the log ID
      const logs = await auditService.getLogs({ limit: 1 })
      testLogId = logs[0].id
    })

    it('should return specific audit log for admin', async () => {
      // Act
      const response = await request(app.fetch)
        .get(`/api/audit/logs/${testLogId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      // Assert
      expect(response.status).toBe(200)
      expect(response.body.log).toBeDefined()
      expect(response.body.log.id).toBe(testLogId)
      expect(response.body.log.action).toBe('CREATE')
      expect(response.body.log.resource).toBe('project')
      expect(response.body.log.details).toBeDefined()
    })

    it('should deny access to regular users', async () => {
      // Act
      const response = await request(app.fetch)
        .get(`/api/audit/logs/${testLogId}`)
        .set('Authorization', `Bearer ${authToken}`)

      // Assert
      expect(response.status).toBe(403)
      expect(response.body.error.code).toBe('AUTHZ_002')
    })

    it('should return 404 for non-existent log', async () => {
      // Act
      const response = await request(app.fetch)
        .get('/api/audit/logs/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`)

      // Assert
      expect(response.status).toBe(404)
      expect(response.body.error.code).toBe('RES_001')
    })

    it('should require authentication', async () => {
      // Act
      const response = await request(app.fetch)
        .get(`/api/audit/logs/${testLogId}`)

      // Assert
      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('AUTH_001')
    })
  })

  describe('GET /api/audit/stats', () => {
    beforeEach(async () => {
      // Create various audit logs for stats
      const actions = ['CREATE', 'UPDATE', 'DELETE', 'READ']
      const resources = ['project', 'environment', 'user', 'variable']
      
      for (let i = 0; i < 10; i++) {
        await auditService.log({
          userId: i % 2 === 0 ? testUser.id : adminUser.id,
          action: actions[i % actions.length],
          resource: resources[i % resources.length],
          resourceId: `resource-${i}`,
          details: { index: i },
          ipAddress: '127.0.0.1',
          userAgent: 'Test Agent'
        })
      }
    })

    it('should return audit statistics for admin', async () => {
      // Act
      const response = await request(app.fetch)
        .get('/api/audit/stats')
        .set('Authorization', `Bearer ${adminToken}`)

      // Assert
      expect(response.status).toBe(200)
      expect(response.body.stats).toBeDefined()
      expect(response.body.stats.totalLogs).toBeGreaterThan(0)
      expect(response.body.stats.actionBreakdown).toBeDefined()
      expect(response.body.stats.resourceBreakdown).toBeDefined()
      expect(response.body.stats.userBreakdown).toBeDefined()
    })

    it('should support date range for stats', async () => {
      // Arrange
      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const endDate = new Date().toISOString()

      // Act
      const response = await request(app.fetch)
        .get(`/api/audit/stats?startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${adminToken}`)

      // Assert
      expect(response.status).toBe(200)
      expect(response.body.stats.totalLogs).toBeGreaterThan(0)
    })

    it('should deny access to regular users', async () => {
      // Act
      const response = await request(app.fetch)
        .get('/api/audit/stats')
        .set('Authorization', `Bearer ${authToken}`)

      // Assert
      expect(response.status).toBe(403)
      expect(response.body.error.code).toBe('AUTHZ_002')
    })

    it('should require authentication', async () => {
      // Act
      const response = await request(app.fetch)
        .get('/api/audit/stats')

      // Assert
      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('AUTH_001')
    })
  })

  describe('DELETE /api/audit/logs', () => {
    beforeEach(async () => {
      // Create old audit logs
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) // 100 days ago
      
      for (let i = 0; i < 5; i++) {
        await auditService.log({
          userId: testUser.id,
          action: 'CREATE',
          resource: 'project',
          resourceId: `old-project-${i}`,
          details: { name: `Old Project ${i}` },
          ipAddress: '127.0.0.1',
          userAgent: 'Test Agent'
        })
      }
    })

    it('should cleanup old audit logs for admin', async () => {
      // Act
      const response = await request(app.fetch)
        .delete('/api/audit/logs?retentionDays=30')
        .set('Authorization', `Bearer ${adminToken}`)

      // Assert
      expect(response.status).toBe(200)
      expect(response.body.message).toBeDefined()
      expect(response.body.deletedCount).toBeGreaterThanOrEqual(0)
    })

    it('should use default retention period', async () => {
      // Act
      const response = await request(app.fetch)
        .delete('/api/audit/logs')
        .set('Authorization', `Bearer ${adminToken}`)

      // Assert
      expect(response.status).toBe(200)
      expect(response.body.deletedCount).toBeGreaterThanOrEqual(0)
    })

    it('should validate retention days parameter', async () => {
      // Act
      const response = await request(app.fetch)
        .delete('/api/audit/logs?retentionDays=invalid')
        .set('Authorization', `Bearer ${adminToken}`)

      // Assert
      expect(response.status).toBe(400)
      expect(response.body.error.code).toBe('VALID_002')
    })

    it('should deny access to regular users', async () => {
      // Act
      const response = await request(app.fetch)
        .delete('/api/audit/logs')
        .set('Authorization', `Bearer ${authToken}`)

      // Assert
      expect(response.status).toBe(403)
      expect(response.body.error.code).toBe('AUTHZ_002')
    })

    it('should require authentication', async () => {
      // Act
      const response = await request(app.fetch)
        .delete('/api/audit/logs')

      // Assert
      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('AUTH_001')
    })
  })

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      // Arrange - Close database to cause service errors
      await dbManager.close()

      // Act
      const response = await request(app.fetch)
        .get('/api/audit/logs')
        .set('Authorization', `Bearer ${adminToken}`)

      // Assert
      expect(response.status).toBe(500)
      expect(response.body.error.code).toBe('SYS_001')
    })

    it('should validate query parameters', async () => {
      // Act
      const response = await request(app.fetch)
        .get('/api/audit/logs?limit=invalid')
        .set('Authorization', `Bearer ${adminToken}`)

      // Assert
      expect(response.status).toBe(400)
      expect(response.body.error.code).toBe('VALID_002')
    })

    it('should handle malformed request bodies', async () => {
      // Act
      const response = await request(app.fetch)
        .post('/api/audit/logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send('invalid json')

      // Assert
      expect(response.status).toBe(400)
    })
  })
})