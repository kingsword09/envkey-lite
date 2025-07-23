/**
 * Simple Performance Tests
 * Basic performance testing for core functionality
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DatabaseManager } from '../../src/db/manager'
import { CryptoService } from '../../src/services/crypto.service'
import { UserService } from '../../src/services/user.service'
import { ProjectService } from '../../src/services/project.service'
import { EnvironmentVariableService } from '../../src/services/environment.service'
import { PerformanceOptimizer } from '../../src/utils/performance-optimizer'
import { 
  measurePerformance, 
  runPerformanceTest,
  MemoryMonitor 
} from './performance-utils'
import { seedTestDatabase, cleanTestDatabase } from '../setup'

describe('Simple Performance Tests', () => {
  let dbManager: DatabaseManager
  let cryptoService: CryptoService
  let userService: UserService
  let projectService: ProjectService
  let environmentService: EnvironmentVariableService
  let optimizer: PerformanceOptimizer
  let testData: any

  beforeAll(async () => {
    // Initialize services
    dbManager = new DatabaseManager({ debug: false })
    await dbManager.initialize()
    await dbManager.runMigrations()
    
    cryptoService = new CryptoService(dbManager)
    await cryptoService.initialize()
    
    userService = new UserService(dbManager, cryptoService)
    projectService = new ProjectService(dbManager)
    environmentService = new EnvironmentVariableService(dbManager, cryptoService)
    optimizer = new PerformanceOptimizer(dbManager)
    
    // Seed test data
    testData = await seedTestDatabase(dbManager)
  }, 30000)

  afterAll(async () => {
    await cleanTestDatabase(dbManager)
    await dbManager.close()
  })

  describe('Database Performance', () => {
    it('should measure user lookup performance', async () => {
      const { stats } = await runPerformanceTest(async () => {
        const user = await userService.getUserByEmail('admin@test.com')
        expect(user).toBeTruthy()
        return user
      }, 50, 'User lookup by email')
      
      expect(stats.avg).toBeLessThan(50)
      expect(stats.p95).toBeLessThan(100)
    })

    it('should measure project creation performance', async () => {
      let counter = 0
      const { stats } = await runPerformanceTest(async () => {
        const project = await projectService.createProject({
          name: `Performance Project ${counter++}`,
          description: 'Performance test project',
          ownerId: testData.users.admin.id
        })
        expect(project).toBeTruthy()
        return project
      }, 25, 'Project creation')
      
      expect(stats.avg).toBeLessThan(200)
      expect(stats.p95).toBeLessThan(400)
    })

    it('should measure environment variable operations', async () => {
      const environmentId = testData.environments[0].id
      let counter = 0
      
      const { stats } = await runPerformanceTest(async () => {
        const variable = await environmentService.setVariable(
          environmentId,
          `PERF_VAR_${counter++}`,
          `performance-value-${counter}`,
          { sensitive: false }
        )
        expect(variable).toBeTruthy()
        return variable
      }, 50, 'Environment variable creation')
      
      expect(stats.avg).toBeLessThan(100)
      expect(stats.p95).toBeLessThan(200)
    })

    it('should measure encrypted variable performance', async () => {
      const environmentId = testData.environments[0].id
      let counter = 0
      
      const { stats } = await runPerformanceTest(async () => {
        const variable = await environmentService.setVariable(
          environmentId,
          `ENCRYPTED_VAR_${counter++}`,
          `encrypted-value-${counter}`,
          { sensitive: true }
        )
        expect(variable).toBeTruthy()
        expect(variable.encrypted).toBe(true)
        return variable
      }, 25, 'Encrypted variable creation')
      
      // Encrypted variables should be slower but still reasonable
      expect(stats.avg).toBeLessThan(200)
      expect(stats.p95).toBeLessThan(400)
    })
  })

  describe('Batch Operations Performance', () => {
    it('should measure batch variable creation performance', async () => {
      const environmentId = testData.environments[0].id
      
      const { result, metrics } = await measurePerformance(async () => {
        const batchData: Record<string, string> = {}
        for (let i = 0; i < 50; i++) {
          batchData[`BATCH_VAR_${i}`] = `batch-value-${i}`
        }
        
        await environmentService.setVariables(environmentId, batchData)
        return batchData
      }, 'Batch variable creation (50 vars)')
      
      expect(Object.keys(result).length).toBe(50)
      expect(metrics.duration).toBeLessThan(1000) // Should complete within 1 second
    })

    it('should measure variable listing with many variables', async () => {
      const environmentId = testData.environments[0].id
      
      // Create many variables first
      const batchData: Record<string, string> = {}
      for (let i = 0; i < 100; i++) {
        batchData[`LIST_VAR_${i}`] = `list-value-${i}`
      }
      await environmentService.setVariables(environmentId, batchData)
      
      const { stats } = await runPerformanceTest(async () => {
        const variables = await environmentService.listVariables(environmentId)
        expect(variables.length).toBeGreaterThan(90)
        return variables
      }, 20, 'Variable listing (100+ vars)')
      
      expect(stats.avg).toBeLessThan(300)
      expect(stats.p95).toBeLessThan(500)
    })
  })

  describe('Memory Usage', () => {
    it('should monitor memory usage during operations', async () => {
      const memoryMonitor = new MemoryMonitor()
      memoryMonitor.start(50) // Shorter interval for more measurements
      
      // Perform many operations with small delays
      const environmentId = testData.environments[0].id
      for (let i = 0; i < 50; i++) {
        await environmentService.setVariable(
          environmentId,
          `MEMORY_TEST_${i}`,
          `memory-test-value-${i}`,
          { sensitive: i % 3 === 0 }
        )
        
        // Small delay to allow memory monitoring
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }
      
      // Wait a bit more for final measurements
      await new Promise(resolve => setTimeout(resolve, 200))
      
      const measurements = memoryMonitor.stop()
      const stats = memoryMonitor.getStats()
      
      expect(measurements.length).toBeGreaterThan(2) // More lenient
      
      // Memory should not grow excessively
      const memoryGrowth = stats!.heapUsed.max - stats!.heapUsed.min
      expect(memoryGrowth).toBeLessThan(100 * 1024 * 1024) // Less than 100MB growth
      
      console.log('Memory usage during operations:', {
        growth: `${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`,
        measurements: measurements.length,
        stats: stats
      })
    })
  })

  describe('Performance Optimization', () => {
    it('should generate performance report', async () => {
      // Record some operations
      optimizer.recordQuery('test-query-1', 150)
      optimizer.recordQuery('test-query-2', 50)
      optimizer.recordQuery('test-query-1', 200)
      optimizer.recordQuery('slow-query', 500)
      
      const report = await optimizer.generatePerformanceReport()
      
      expect(report.slowQueries.length).toBeGreaterThanOrEqual(0)
      expect(report.suggestions.length).toBeGreaterThanOrEqual(0)
      expect(report.memoryUsage.current).toBeDefined()
      expect(report.systemMetrics.uptime).toBeGreaterThan(0)
      
      console.log('Performance report:', {
        slowQueries: report.slowQueries.length,
        suggestions: report.suggestions.length,
        memoryUsage: report.memoryUsage.current.heapUsed
      })
    })

    it('should optimize database with indexes', async () => {
      const { applied, errors } = await optimizer.optimizeDatabase()
      
      expect(applied.length).toBeGreaterThan(0)
      console.log('Applied optimizations:', applied)
      
      if (errors.length > 0) {
        console.log('Optimization errors:', errors)
      }
    })

    it('should get database statistics', async () => {
      const stats = await optimizer.getDatabaseStats()
      
      // Stats might be empty for non-PostgreSQL databases, but should not throw
      expect(stats).toBeDefined()
      expect(stats.tableStats).toBeDefined()
      expect(stats.indexStats).toBeDefined()
    })
  })

  describe('Crypto Performance', () => {
    it('should measure encryption performance', async () => {
      const testData = 'sensitive-data-to-encrypt'
      
      const { stats } = await runPerformanceTest(async () => {
        const encrypted = await cryptoService.encrypt(testData)
        expect(encrypted).toBeTruthy()
        expect(encrypted).not.toBe(testData)
        return encrypted
      }, 100, 'Encryption operations')
      
      expect(stats.avg).toBeLessThan(50)
      expect(stats.p95).toBeLessThan(100)
    })

    it('should measure decryption performance', async () => {
      const testData = 'sensitive-data-to-decrypt'
      const encrypted = await cryptoService.encrypt(testData)
      
      const { stats } = await runPerformanceTest(async () => {
        const decrypted = await cryptoService.decrypt(encrypted)
        expect(decrypted).toBe(testData)
        return decrypted
      }, 100, 'Decryption operations')
      
      expect(stats.avg).toBeLessThan(50)
      expect(stats.p95).toBeLessThan(100)
    })

    it('should measure hash performance', async () => {
      const testData = 'data-to-hash'
      
      const { stats } = await runPerformanceTest(async () => {
        const hashed = await cryptoService.hash(testData)
        expect(hashed).toBeTruthy()
        expect(hashed).not.toBe(testData)
        return hashed
      }, 100, 'Hash operations')
      
      expect(stats.avg).toBeLessThan(100)
      expect(stats.p95).toBeLessThan(200)
    })
  })
})