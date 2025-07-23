/**
 * Database Query Performance Tests
 * Tests the performance of database operations and identifies slow queries
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { eq, and, like, sql, count, desc } from 'drizzle-orm'
import { DatabaseManager } from '../../src/db/manager'
import { CryptoService } from '../../src/services/crypto.service'
import { UserService } from '../../src/services/user.service'
import { ProjectService } from '../../src/services/project.service'
import { EnvironmentVariableService } from '../../src/services/environment.service'
import { AuditService } from '../../src/services/audit.service'
import { 
  measureDatabaseQuery, 
  runPerformanceTest, 
  MemoryMonitor 
} from './performance-utils'
import { seedTestDatabase, cleanTestDatabase } from '../setup'

describe('Database Performance Tests', () => {
  let dbManager: DatabaseManager
  let cryptoService: CryptoService
  let userService: UserService
  let projectService: ProjectService
  let environmentService: EnvironmentVariableService
  let auditService: AuditService
  let testData: any

  beforeAll(async () => {
    // Initialize services
    dbManager = new DatabaseManager({ debug: false })
    await dbManager.initialize()
    await dbManager.runMigrations()
    
    cryptoService = new CryptoService()
    userService = new UserService(dbManager, cryptoService)
    projectService = new ProjectService(dbManager)
    environmentService = new EnvironmentVariableService(dbManager, cryptoService)
    auditService = new AuditService(dbManager)
    
    // Seed initial test data
    testData = await seedTestDatabase(dbManager)
  })

  afterAll(async () => {
    await cleanTestDatabase(dbManager)
    await dbManager.close()
  })

  beforeEach(async () => {
    // Clean up test-specific data
    const schema = dbManager.getSchema()
    const db = dbManager.getDb()
    await db.delete(schema.environmentVariables)
    await db.delete(schema.auditLogs)
  })

  describe('User Queries', () => {
    it('should measure user lookup by email performance', async () => {
      const { stats } = await runPerformanceTest(async () => {
        const { result } = await measureDatabaseQuery(
          () => userService.getUserByEmail('admin@test.com'),
          'getUserByEmail'
        )
        expect(result).toBeTruthy()
        return result
      }, 100, 'User lookup by email')
      
      // Email lookup should be very fast due to unique index
      expect(stats.avg).toBeLessThan(10)
      expect(stats.p95).toBeLessThan(20)
    })

    it('should measure user creation performance', async () => {
      let counter = 0
      const { stats } = await runPerformanceTest(async () => {
        const { result } = await measureDatabaseQuery(
          () => userService.createUser({
            email: `perf-user-${counter++}@test.com`,
            name: `Performance User ${counter}`,
            password: 'password123',
            role: 'user'
          }),
          'createUser'
        )
        expect(result).toBeTruthy()
        return result
      }, 50, 'User creation')
      
      expect(stats.avg).toBeLessThan(50)
      expect(stats.p95).toBeLessThan(100)
    })

    it('should measure API key validation performance', async () => {
      // Create an API key first
      const apiKey = await userService.generateApiKey(testData.users.admin.id, 'Performance Test Key')
      
      const { stats } = await runPerformanceTest(async () => {
        const { result } = await measureDatabaseQuery(
          () => userService.validateApiKey(apiKey.key),
          'validateApiKey'
        )
        expect(result).toBeTruthy()
        return result
      }, 200, 'API key validation')
      
      // API key validation should be extremely fast
      expect(stats.avg).toBeLessThan(5)
      expect(stats.p95).toBeLessThan(15)
    })
  })

  describe('Project Queries', () => {
    it('should measure project listing performance', async () => {
      // Create multiple projects
      const projects = []
      for (let i = 0; i < 50; i++) {
        const project = await projectService.createProject({
          name: `Performance Project ${i}`,
          description: `Project for performance testing ${i}`,
          ownerId: testData.users.admin.id
        })
        projects.push(project)
      }

      const { stats } = await runPerformanceTest(async () => {
        const { result } = await measureDatabaseQuery(
          () => projectService.listProjects(testData.users.admin.id),
          'listProjects'
        )
        expect(result.length).toBeGreaterThan(40)
        return result
      }, 30, 'Project listing')
      
      expect(stats.avg).toBeLessThan(50)
      expect(stats.p95).toBeLessThan(100)
    })

    it('should measure project with environments query performance', async () => {
      // Create project with many environments
      const project = await projectService.createProject({
        name: 'Multi-Environment Project',
        description: 'Project with many environments',
        ownerId: testData.users.admin.id
      })

      for (let i = 0; i < 20; i++) {
        await projectService.createEnvironment(project.id, {
          name: `env-${i}`
        })
      }

      const { stats } = await runPerformanceTest(async () => {
        const { result } = await measureDatabaseQuery(
          () => projectService.getProjectWithEnvironments(project.id),
          'getProjectWithEnvironments'
        )
        expect(result).toBeTruthy()
        expect(result.environments.length).toBe(20)
        return result
      }, 20, 'Project with environments')
      
      expect(stats.avg).toBeLessThan(100)
      expect(stats.p95).toBeLessThan(200)
    })
  })

  describe('Environment Variable Queries', () => {
    let environmentId: string

    beforeEach(async () => {
      const environment = await projectService.createEnvironment(testData.project.id, {
        name: 'performance-test-env'
      })
      environmentId = environment.id
    })

    it('should measure single variable creation performance', async () => {
      let counter = 0
      const { stats } = await runPerformanceTest(async () => {
        const { result } = await measureDatabaseQuery(
          () => environmentService.setVariable(
            environmentId,
            `PERF_VAR_${counter++}`,
            `performance-value-${counter}`,
            { sensitive: false }
          ),
          'setVariable'
        )
        expect(result).toBeTruthy()
        return result
      }, 100, 'Variable creation')
      
      expect(stats.avg).toBeLessThan(30)
      expect(stats.p95).toBeLessThan(60)
    })

    it('should measure variable listing performance with many variables', async () => {
      // Create many variables
      const promises = []
      for (let i = 0; i < 500; i++) {
        promises.push(
          environmentService.setVariable(
            environmentId,
            `BULK_VAR_${i}`,
            `bulk-value-${i}`,
            { sensitive: i % 5 === 0 }
          )
        )
      }
      await Promise.all(promises)

      const { stats } = await runPerformanceTest(async () => {
        const { result } = await measureDatabaseQuery(
          () => environmentService.listVariables(environmentId),
          'listVariables (500 vars)'
        )
        expect(result.length).toBe(500)
        return result
      }, 20, 'Variable listing (500 variables)')
      
      expect(stats.avg).toBeLessThan(200)
      expect(stats.p95).toBeLessThan(400)
    })

    it('should measure variable search performance', async () => {
      // Create variables with searchable names
      for (let i = 0; i < 100; i++) {
        await environmentService.setVariable(
          environmentId,
          `SEARCH_VAR_${i}`,
          `search-value-${i}`,
          { sensitive: false }
        )
      }

      const { stats } = await runPerformanceTest(async () => {
        const { result } = await measureDatabaseQuery(
          () => environmentService.searchVariables(environmentId, 'SEARCH_VAR'),
          'searchVariables'
        )
        expect(result.length).toBeGreaterThan(90)
        return result
      }, 30, 'Variable search')
      
      expect(stats.avg).toBeLessThan(100)
      expect(stats.p95).toBeLessThan(200)
    })

    it('should measure batch variable operations performance', async () => {
      const batchData: Record<string, string> = {}
      for (let i = 0; i < 100; i++) {
        batchData[`BATCH_VAR_${i}`] = `batch-value-${i}`
      }

      const { stats } = await runPerformanceTest(async () => {
        const { result } = await measureDatabaseQuery(
          () => environmentService.setVariables(environmentId, batchData),
          'setVariables (batch 100)'
        )
        return result
      }, 10, 'Batch variable operations (100 vars)')
      
      expect(stats.avg).toBeLessThan(500)
      expect(stats.p95).toBeLessThan(1000)
    })

    it('should measure encrypted variable performance', async () => {
      let counter = 0
      const { stats } = await runPerformanceTest(async () => {
        const { result } = await measureDatabaseQuery(
          () => environmentService.setVariable(
            environmentId,
            `ENCRYPTED_VAR_${counter++}`,
            `encrypted-value-${counter}`,
            { sensitive: true }
          ),
          'setVariable (encrypted)'
        )
        expect(result).toBeTruthy()
        expect(result.encrypted).toBe(true)
        return result
      }, 50, 'Encrypted variable creation')
      
      // Encrypted variables should be slower due to encryption overhead
      expect(stats.avg).toBeLessThan(100)
      expect(stats.p95).toBeLessThan(200)
    })
  })

  describe('Audit Log Queries', () => {
    beforeEach(async () => {
      // Create audit log entries
      for (let i = 0; i < 200; i++) {
        await auditService.log({
          userId: testData.users.admin.id,
          action: i % 2 === 0 ? 'CREATE' : 'UPDATE',
          resource: 'environment_variable',
          resourceId: testData.environments[0].id,
          details: { key: `VAR_${i}`, value: `value_${i}` },
          ipAddress: '127.0.0.1',
          userAgent: 'Test Agent'
        })
      }
    })

    it('should measure audit log listing performance', async () => {
      const { stats } = await runPerformanceTest(async () => {
        const { result } = await measureDatabaseQuery(
          () => auditService.getLogs({
            limit: 50,
            offset: 0
          }),
          'getLogs (paginated)'
        )
        expect(result.length).toBe(50)
        return result
      }, 20, 'Audit log listing')
      
      expect(stats.avg).toBeLessThan(100)
      expect(stats.p95).toBeLessThan(200)
    })

    it('should measure audit log filtering performance', async () => {
      const { stats } = await runPerformanceTest(async () => {
        const { result } = await measureDatabaseQuery(
          () => auditService.getLogs({
            userId: testData.users.admin.id,
            action: 'CREATE',
            resource: 'environment_variable',
            limit: 25
          }),
          'getLogs (filtered)'
        )
        expect(result.length).toBeGreaterThan(0)
        return result
      }, 20, 'Audit log filtering')
      
      expect(stats.avg).toBeLessThan(150)
      expect(stats.p95).toBeLessThan(300)
    })

    it('should measure audit log cleanup performance', async () => {
      const { result, metrics } = await measureDatabaseQuery(
        () => auditService.cleanup(1), // Delete logs older than 1 day
        'cleanup audit logs'
      )
      
      expect(metrics.duration).toBeLessThan(1000) // Should complete within 1 second
      console.log(`Cleaned up ${result} audit log entries in ${metrics.duration.toFixed(2)}ms`)
    })
  })

  describe('Complex Query Performance', () => {
    beforeEach(async () => {
      // Create complex test data structure
      const users = []
      const projects = []
      const environments = []
      
      // Create multiple users
      for (let i = 0; i < 10; i++) {
        const user = await userService.createUser({
          email: `complex-user-${i}@test.com`,
          name: `Complex User ${i}`,
          password: 'password123',
          role: 'user'
        })
        users.push(user)
      }
      
      // Create projects for each user
      for (const user of users) {
        for (let j = 0; j < 5; j++) {
          const project = await projectService.createProject({
            name: `${user.name} Project ${j}`,
            description: `Project ${j} for ${user.name}`,
            ownerId: user.id
          })
          projects.push(project)
          
          // Create environments for each project
          for (let k = 0; k < 3; k++) {
            const env = await projectService.createEnvironment(project.id, {
              name: `env-${k}`
            })
            environments.push(env)
            
            // Create variables for each environment
            for (let l = 0; l < 20; l++) {
              await environmentService.setVariable(
                env.id,
                `VAR_${l}`,
                `value-${l}`,
                { sensitive: l % 4 === 0 }
              )
            }
          }
        }
      }
    })

    it('should measure complex join query performance', async () => {
      const schema = dbManager.getSchema()
      const db = dbManager.getDb()
      
      const { stats } = await runPerformanceTest(async () => {
        const { result } = await measureDatabaseQuery(
          () => db
            .select({
              projectName: schema.projects.name,
              environmentName: schema.environments.name,
              variableCount: count(schema.environmentVariables.id),
              ownerName: schema.users.name
            })
            .from(schema.projects)
            .leftJoin(schema.environments, eq(schema.projects.id, schema.environments.projectId))
            .leftJoin(schema.environmentVariables, eq(schema.environments.id, schema.environmentVariables.environmentId))
            .leftJoin(schema.users, eq(schema.projects.ownerId, schema.users.id))
            .groupBy(
              schema.projects.id,
              schema.projects.name,
              schema.environments.name,
              schema.users.name
            )
            .orderBy(desc(count(schema.environmentVariables.id))),
          'complex join query'
        )
        expect(result.length).toBeGreaterThan(0)
        return result
      }, 10, 'Complex join query')
      
      expect(stats.avg).toBeLessThan(500)
      expect(stats.p95).toBeLessThan(1000)
    })

    it('should measure aggregation query performance', async () => {
      const schema = dbManager.getSchema()
      const db = dbManager.getDb()
      
      const { stats } = await runPerformanceTest(async () => {
        const { result } = await measureDatabaseQuery(
          () => db
            .select({
              userId: schema.users.id,
              userName: schema.users.name,
              projectCount: count(schema.projects.id),
              totalVariables: sql<number>`count(${schema.environmentVariables.id})`,
              sensitiveVariables: sql<number>`count(case when ${schema.environmentVariables.sensitive} then 1 end)`
            })
            .from(schema.users)
            .leftJoin(schema.projects, eq(schema.users.id, schema.projects.ownerId))
            .leftJoin(schema.environments, eq(schema.projects.id, schema.environments.projectId))
            .leftJoin(schema.environmentVariables, eq(schema.environments.id, schema.environmentVariables.environmentId))
            .groupBy(schema.users.id, schema.users.name)
            .having(sql`count(${schema.projects.id}) > 0`),
          'aggregation query'
        )
        expect(result.length).toBeGreaterThan(0)
        return result
      }, 10, 'Aggregation query')
      
      expect(stats.avg).toBeLessThan(800)
      expect(stats.p95).toBeLessThan(1500)
    })
  })

  describe('Memory Usage During Database Operations', () => {
    it('should monitor memory usage during bulk operations', async () => {
      const environmentId = testData.environments[0].id
      const memoryMonitor = new MemoryMonitor()
      memoryMonitor.start(100)

      // Perform bulk operations
      const batchSize = 100
      for (let batch = 0; batch < 10; batch++) {
        const batchData: Record<string, string> = {}
        for (let i = 0; i < batchSize; i++) {
          batchData[`BULK_${batch}_${i}`] = `bulk-value-${batch}-${i}`
        }
        
        await environmentService.setVariables(environmentId, batchData)
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc()
        }
      }

      const measurements = memoryMonitor.stop()
      const stats = memoryMonitor.getStats()
      
      expect(measurements.length).toBeGreaterThan(50)
      
      // Memory should not grow excessively during bulk operations
      const memoryGrowth = stats!.heapUsed.max - stats!.heapUsed.min
      expect(memoryGrowth).toBeLessThan(100 * 1024 * 1024) // Less than 100MB growth
      
      console.log('Memory usage during bulk database operations:', {
        growth: `${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`,
        stats: stats
      })
    })
  })

  describe('Database Connection Performance', () => {
    it('should measure database initialization performance', async () => {
      const { result, metrics } = await measureDatabaseQuery(async () => {
        const testDbManager = new DatabaseManager({ debug: false })
        await testDbManager.initialize()
        await testDbManager.close()
        return 'initialized'
      }, 'database initialization')
      
      expect(result).toBe('initialized')
      expect(metrics.duration).toBeLessThan(1000) // Should initialize within 1 second
    })

    it('should measure migration performance', async () => {
      const testDbManager = new DatabaseManager({ debug: false })
      await testDbManager.initialize()
      
      const { result, metrics } = await measureDatabaseQuery(
        () => testDbManager.runMigrations(),
        'database migrations'
      )
      
      expect(metrics.duration).toBeLessThan(2000) // Migrations should complete within 2 seconds
      
      await testDbManager.close()
    })
  })
})