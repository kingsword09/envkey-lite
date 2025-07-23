/**
 * API Response Time Performance Tests
 * Tests the performance of various API endpoints under different load conditions
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Hono } from 'hono'
import request from 'supertest'
import { DatabaseManager } from '../../src/db/manager'
import { CryptoService } from '../../src/services/crypto.service'
import { createAuthRoutes } from '../../src/routes/auth.routes'
import { createProjectRoutes } from '../../src/routes/projects.routes'
import { createEnvironmentRoutes } from '../../src/routes/environment.routes'
import { createAuditRoutes } from '../../src/routes/audit.routes'
import { 
  measureAPIPerformance, 
  runPerformanceTest, 
  runLoadTest,
  MemoryMonitor 
} from './performance-utils'
import { seedTestDatabase, cleanTestDatabase } from '../setup'

describe('API Performance Tests', () => {
  let app: Hono
  let dbManager: DatabaseManager
  let cryptoService: CryptoService
  let testData: any
  let authToken: string
  let apiKey: string

  beforeAll(async () => {
    // Initialize services
    dbManager = new DatabaseManager({ debug: false })
    await dbManager.initialize()
    await dbManager.runMigrations()
    
    cryptoService = new CryptoService()
    
    // Create Hono app with all routes
    app = new Hono()
    const jwtSecret = 'test-jwt-secret'
    
    app.route('/auth', createAuthRoutes(dbManager, cryptoService, jwtSecret))
    app.route('/projects', createProjectRoutes(dbManager, cryptoService, jwtSecret))
    app.route('/environments', createEnvironmentRoutes(dbManager, cryptoService, jwtSecret))
    app.route('/audit', createAuditRoutes(dbManager, jwtSecret))
    
    // Seed test data
    testData = await seedTestDatabase(dbManager)
    
    // Get auth token
    const loginResponse = await request(app.request.bind(app))
      .post('/auth/login')
      .send({
        email: 'admin@test.com',
        password: 'password'
      })
    
    authToken = loginResponse.body.token
    
    // Create API key
    const apiKeyResponse = await request(app.request.bind(app))
      .post('/auth/api-keys')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Performance Test Key' })
    
    apiKey = apiKeyResponse.body.key
  })

  afterAll(async () => {
    await cleanTestDatabase(dbManager)
    await dbManager.close()
  })

  beforeEach(async () => {
    // Clean up any test-specific data between tests
    const schema = dbManager.getSchema()
    const db = dbManager.getDb()
    await db.delete(schema.environmentVariables)
  })

  describe('Authentication Endpoints', () => {
    it('should measure login performance', async () => {
      const { stats } = await runPerformanceTest(async () => {
        const response = await request(app.request.bind(app))
          .post('/auth/login')
          .send({
            email: 'admin@test.com',
            password: 'password'
          })
        
        expect(response.status).toBe(200)
        return response
      }, 50, 'Login endpoint')
      
      // Performance assertions
      expect(stats.avg).toBeLessThan(100) // Average response time should be under 100ms
      expect(stats.p95).toBeLessThan(200) // 95th percentile should be under 200ms
      expect(stats.max).toBeLessThan(500) // Max response time should be under 500ms
    })

    it('should measure API key validation performance', async () => {
      const { stats } = await runPerformanceTest(async () => {
        const response = await request(app.request.bind(app))
          .get('/auth/me')
          .set('X-API-Key', apiKey)
        
        expect(response.status).toBe(200)
        return response
      }, 100, 'API key validation')
      
      // API key validation should be very fast
      expect(stats.avg).toBeLessThan(50)
      expect(stats.p95).toBeLessThan(100)
    })
  })

  describe('Project Management Endpoints', () => {
    it('should measure project listing performance', async () => {
      // Create multiple projects for testing
      for (let i = 0; i < 20; i++) {
        await request(app.request.bind(app))
          .post('/projects')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: `Performance Test Project ${i}`,
            description: `Project for performance testing ${i}`
          })
      }

      const { stats } = await runPerformanceTest(async () => {
        const response = await request(app.request.bind(app))
          .get('/projects')
          .set('Authorization', `Bearer ${authToken}`)
        
        expect(response.status).toBe(200)
        expect(response.body.length).toBeGreaterThan(15)
        return response
      }, 30, 'Project listing')
      
      expect(stats.avg).toBeLessThan(150)
      expect(stats.p95).toBeLessThan(300)
    })

    it('should measure project creation performance', async () => {
      let counter = 0
      const { stats } = await runPerformanceTest(async () => {
        const response = await request(app.request.bind(app))
          .post('/projects')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: `Perf Project ${counter++}`,
            description: 'Performance test project'
          })
        
        expect(response.status).toBe(201)
        return response
      }, 25, 'Project creation')
      
      expect(stats.avg).toBeLessThan(200)
      expect(stats.p95).toBeLessThan(400)
    })
  })

  describe('Environment Variable Endpoints', () => {
    let environmentId: string

    beforeEach(async () => {
      // Create a test environment
      const envResponse = await request(app.request.bind(app))
        .post(`/projects/${testData.project.id}/environments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'performance-test' })
      
      environmentId = envResponse.body.id
    })

    it('should measure environment variable creation performance', async () => {
      let counter = 0
      const { stats } = await runPerformanceTest(async () => {
        const response = await request(app.request.bind(app))
          .post(`/environments/${environmentId}/variables`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            key: `PERF_VAR_${counter++}`,
            value: `performance-test-value-${counter}`,
            sensitive: false
          })
        
        expect(response.status).toBe(201)
        return response
      }, 50, 'Environment variable creation')
      
      expect(stats.avg).toBeLessThan(100)
      expect(stats.p95).toBeLessThan(200)
    })

    it('should measure environment variable listing performance with many variables', async () => {
      // Create many variables
      const promises = []
      for (let i = 0; i < 100; i++) {
        promises.push(
          request(app.request.bind(app))
            .post(`/environments/${environmentId}/variables`)
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              key: `BULK_VAR_${i}`,
              value: `bulk-value-${i}`,
              sensitive: i % 3 === 0 // Make every 3rd variable sensitive
            })
        )
      }
      await Promise.all(promises)

      const { stats } = await runPerformanceTest(async () => {
        const response = await request(app.request.bind(app))
          .get(`/environments/${environmentId}/variables`)
          .set('Authorization', `Bearer ${authToken}`)
        
        expect(response.status).toBe(200)
        expect(response.body.length).toBe(100)
        return response
      }, 20, 'Environment variable listing (100 vars)')
      
      expect(stats.avg).toBeLessThan(300)
      expect(stats.p95).toBeLessThan(500)
    })

    it('should measure client API performance (environment variable retrieval)', async () => {
      // Create some variables
      await request(app.request.bind(app))
        .post(`/environments/${environmentId}/variables`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          key: 'CLIENT_TEST_VAR',
          value: 'client-test-value',
          sensitive: false
        })

      const { stats } = await runPerformanceTest(async () => {
        const response = await request(app.request.bind(app))
          .get(`/environments/${environmentId}/client`)
          .set('X-API-Key', apiKey)
        
        expect(response.status).toBe(200)
        expect(response.body.CLIENT_TEST_VAR).toBe('client-test-value')
        return response
      }, 100, 'Client API variable retrieval')
      
      // Client API should be very fast as it's the most frequently used endpoint
      expect(stats.avg).toBeLessThan(50)
      expect(stats.p95).toBeLessThan(100)
    })

    it('should measure batch variable operations performance', async () => {
      const batchData = {}
      for (let i = 0; i < 50; i++) {
        batchData[`BATCH_VAR_${i}`] = `batch-value-${i}`
      }

      const { stats } = await runPerformanceTest(async () => {
        const response = await request(app.request.bind(app))
          .post(`/environments/${environmentId}/variables/batch`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ variables: batchData })
        
        expect(response.status).toBe(200)
        return response
      }, 10, 'Batch variable operations (50 vars)')
      
      expect(stats.avg).toBeLessThan(500)
      expect(stats.p95).toBeLessThan(1000)
    })
  })

  describe('Load Testing', () => {
    let environmentId: string

    beforeEach(async () => {
      const envResponse = await request(app.request.bind(app))
        .post(`/projects/${testData.project.id}/environments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'load-test' })
      
      environmentId = envResponse.body.id

      // Create some variables for load testing
      await request(app.request.bind(app))
        .post(`/environments/${environmentId}/variables`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          key: 'LOAD_TEST_VAR',
          value: 'load-test-value',
          sensitive: false
        })
    })

    it('should handle concurrent client API requests', async () => {
      const memoryMonitor = new MemoryMonitor()
      memoryMonitor.start(500)

      const loadTestResults = await runLoadTest(async () => {
        const response = await request(app.request.bind(app))
          .get(`/environments/${environmentId}/client`)
          .set('X-API-Key', apiKey)
        
        if (response.status !== 200) {
          throw new Error(`Request failed with status ${response.status}`)
        }
        
        return response.body
      }, 20, 10000, 'Concurrent client API requests')

      const memoryStats = memoryMonitor.stop()
      
      // Load test assertions
      expect(loadTestResults.successfulRequests).toBeGreaterThan(0)
      expect(loadTestResults.failedRequests).toBe(0)
      expect(loadTestResults.requestsPerSecond).toBeGreaterThan(50)
      expect(loadTestResults.avgResponseTime).toBeLessThan(100)
      
      console.log('Memory usage during load test:', memoryMonitor.getStats())
    })

    it('should handle concurrent variable creation requests', async () => {
      let counter = 0
      const loadTestResults = await runLoadTest(async () => {
        const response = await request(app.request.bind(app))
          .post(`/environments/${environmentId}/variables`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            key: `CONCURRENT_VAR_${Date.now()}_${counter++}`,
            value: `concurrent-value-${counter}`,
            sensitive: false
          })
        
        if (response.status !== 201) {
          throw new Error(`Request failed with status ${response.status}`)
        }
        
        return response.body
      }, 10, 5000, 'Concurrent variable creation')

      // Should handle concurrent writes reasonably well
      expect(loadTestResults.successfulRequests).toBeGreaterThan(0)
      expect(loadTestResults.failedRequests / loadTestResults.totalRequests).toBeLessThan(0.1) // Less than 10% failure rate
      expect(loadTestResults.avgResponseTime).toBeLessThan(500)
    })
  })

  describe('Memory Usage Tests', () => {
    it('should not have significant memory leaks during repeated operations', async () => {
      const memoryMonitor = new MemoryMonitor()
      memoryMonitor.start(100)

      // Perform many operations
      for (let i = 0; i < 100; i++) {
        await request(app.request.bind(app))
          .get('/projects')
          .set('Authorization', `Bearer ${authToken}`)
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc()
        }
      }

      const measurements = memoryMonitor.stop()
      const stats = memoryMonitor.getStats()
      
      expect(measurements.length).toBeGreaterThan(10)
      
      // Memory should not grow excessively
      const memoryGrowth = stats!.heapUsed.max - stats!.heapUsed.min
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024) // Less than 50MB growth
      
      console.log('Memory growth during repeated operations:', {
        growth: `${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`,
        stats: stats
      })
    })
  })
})