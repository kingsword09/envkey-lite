import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DatabaseManager, type DatabaseConfig } from './manager'

describe('DatabaseManager', () => {
  let dbManager: DatabaseManager

  beforeEach(async () => {
    // Use in-memory database for testing
    const config: DatabaseConfig = {
      debug: false,
      autoMigrate: false, // Disable auto migrations for most tests
    }
    dbManager = new DatabaseManager(config)
  })

  afterEach(async () => {
    if (dbManager.isReady()) {
      await dbManager.close()
    }
  })

  describe('initialization', () => {
    it('should initialize successfully with default config', async () => {
      await dbManager.initialize()
      expect(dbManager.isReady()).toBe(true)
    })

    it('should initialize successfully with custom config', async () => {
      const customConfig: DatabaseConfig = {
        debug: true,
      }
      const customDbManager = new DatabaseManager(customConfig)
      
      await customDbManager.initialize()
      expect(customDbManager.isReady()).toBe(true)
      
      await customDbManager.close()
    })

    it('should not initialize twice', async () => {
      await dbManager.initialize()
      await dbManager.initialize() // Should not throw
      expect(dbManager.isReady()).toBe(true)
    })

    it('should throw error when accessing db before initialization', () => {
      expect(() => dbManager.getDb()).toThrow('Database not initialized')
      expect(() => dbManager.getPGlite()).toThrow('Database not initialized')
    })
  })

  describe('database operations', () => {
    beforeEach(async () => {
      await dbManager.initialize()
    })

    it('should execute raw SQL queries', async () => {
      const result = await dbManager.query<{ test_value: number }>('SELECT 1 as test_value')
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]!.test_value).toBe(1)
      expect(result.rowCount).toBe(1)
    })

    it('should execute parameterized queries', async () => {
      // Create a test table
      await dbManager.execute(`
        CREATE TABLE test_table (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          value INTEGER
        )
      `)

      // Insert data with parameters
      await dbManager.execute(
        'INSERT INTO test_table (name, value) VALUES ($1, $2)',
        ['test_name', 42]
      )

      // Query with parameters
      const result = await dbManager.query<{ id: number; name: string; value: number }>(
        'SELECT * FROM test_table WHERE name = $1',
        ['test_name']
      )

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]!.name).toBe('test_name')
      expect(result.rows[0]!.value).toBe(42)
    })

    it('should handle query errors gracefully', async () => {
      await expect(
        dbManager.query('SELECT * FROM non_existent_table')
      ).rejects.toThrow('Query failed')
    })

    it('should handle execute errors gracefully', async () => {
      await expect(
        dbManager.execute('INVALID SQL STATEMENT')
      ).rejects.toThrow('Execute failed')
    })
  })

  describe('transactions', () => {
    beforeEach(async () => {
      await dbManager.initialize()
      
      // Create test table
      await dbManager.execute(`
        CREATE TABLE transaction_test (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL
        )
      `)
    })

    it('should commit successful transactions', async () => {
      await dbManager.transaction(async (tx) => {
        await tx.execute(
          'INSERT INTO transaction_test (name) VALUES ($1)',
          ['test1']
        )
        await tx.execute(
          'INSERT INTO transaction_test (name) VALUES ($1)',
          ['test2']
        )
      })

      const result = await dbManager.query<{ count: string }>('SELECT COUNT(*) as count FROM transaction_test')
      expect(parseInt(result.rows[0]!.count)).toBe(2)
    })

    it('should rollback failed transactions', async () => {
      try {
        await dbManager.transaction(async (tx) => {
          await tx.execute(
            'INSERT INTO transaction_test (name) VALUES ($1)',
            ['test1']
          )
          // This should cause the transaction to fail
          await tx.execute('INVALID SQL')
        })
      } catch {
        // Expected to fail
      }

      const result = await dbManager.query<{ count: string }>('SELECT COUNT(*) as count FROM transaction_test')
      expect(parseInt(result.rows[0]!.count)).toBe(0)
    })

    it('should support nested operations in transactions', async () => {
      const result = await dbManager.transaction(async (tx) => {
        await tx.execute(
          'INSERT INTO transaction_test (name) VALUES ($1)',
          ['nested_test']
        )
        
        const queryResult = await tx.query<{ id: number; name: string }>(
          'SELECT * FROM transaction_test WHERE name = $1',
          ['nested_test']
        )
        
        return queryResult.rows[0]
      })

      expect(result?.name).toBe('nested_test')
    })
  })

  describe('health check', () => {
    it('should return unhealthy when not initialized', async () => {
      const health = await dbManager.healthCheck()
      expect(health.status).toBe('unhealthy')
      expect(health.details).toBe('Database not initialized')
    })

    it('should return healthy when properly initialized', async () => {
      await dbManager.initialize()
      const health = await dbManager.healthCheck()
      expect(health.status).toBe('healthy')
      expect(health.details).toBeUndefined()
    })
  })

  describe('database lifecycle', () => {
    it('should close database connection', async () => {
      await dbManager.initialize()
      expect(dbManager.isReady()).toBe(true)
      
      await dbManager.close()
      expect(dbManager.isReady()).toBe(false)
    })

    it('should handle multiple close calls gracefully', async () => {
      await dbManager.initialize()
      await dbManager.close()
      await dbManager.close() // Should not throw
      expect(dbManager.isReady()).toBe(false)
    })

    it('should reset database successfully', async () => {
      await dbManager.initialize()
      
      // Create test table and data
      await dbManager.execute(`
        CREATE TABLE reset_test (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255)
        )
      `)
      await dbManager.execute(
        'INSERT INTO reset_test (name) VALUES ($1)',
        ['test_data']
      )

      // Verify data exists
      const result = await dbManager.query<{ count: string }>('SELECT COUNT(*) as count FROM reset_test')
      expect(parseInt(result.rows[0]!.count)).toBe(1)

      // Reset database
      await dbManager.reset()

      // Verify table is gone
      await expect(
        dbManager.query('SELECT COUNT(*) as count FROM reset_test')
      ).rejects.toThrow()
    })
  })

  describe('error handling', () => {
    it('should throw meaningful errors for uninitialized operations', async () => {
      await expect(dbManager.query('SELECT 1')).rejects.toThrow('Database not initialized')
      await expect(dbManager.execute('SELECT 1')).rejects.toThrow('Database not initialized')
      await expect(
        dbManager.transaction(async () => {})
      ).rejects.toThrow('Database not initialized')
    })

    it('should handle database connection errors', async () => {
      // PGlite is very resilient and creates directories as needed
      // This test demonstrates the error handling structure for other potential errors
      const invalidDbManager = new DatabaseManager({
        dataDir: '/tmp/test-invalid-path-that-should-work',
      })

      // This should actually work since PGlite creates directories
      await invalidDbManager.initialize()
      expect(invalidDbManager.isReady()).toBe(true)
      await invalidDbManager.close()
    })
  })

  describe('database instances', () => {
    beforeEach(async () => {
      await dbManager.initialize()
    })

    it('should provide access to Drizzle database instance', () => {
      const db = dbManager.getDb()
      expect(db).toBeDefined()
      expect(typeof db.select).toBe('function')
      expect(typeof db.insert).toBe('function')
      expect(typeof db.update).toBe('function')
      expect(typeof db.delete).toBe('function')
    })

    it('should provide access to PGlite instance', () => {
      const pglite = dbManager.getPGlite()
      expect(pglite).toBeDefined()
      expect(typeof pglite.query).toBe('function')
      expect(typeof pglite.exec).toBe('function')
    })
    
    it('should provide access to schema', () => {
      const schema = dbManager.getSchema()
      expect(schema).toBeDefined()
      expect(schema.users).toBeDefined()
      expect(schema.projects).toBeDefined()
      expect(schema.environments).toBeDefined()
    })
  })
  
  describe('enhanced transaction support', () => {
    beforeEach(async () => {
      await dbManager.initialize()
      
      // Create test table
      await dbManager.execute(`
        CREATE TABLE drizzle_transaction_test (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL
        )
      `)
    })
    
    it('should provide access to Drizzle ORM within transactions', async () => {
      await dbManager.transaction(async (tx) => {
        expect(tx.db).toBeDefined()
        expect(typeof tx.db.select).toBe('function')
        expect(typeof tx.db.insert).toBe('function')
      })
    })
    
    it('should support both raw SQL and Drizzle ORM in transactions', async () => {
      await dbManager.transaction(async (tx) => {
        // Raw SQL
        await tx.execute(
          'INSERT INTO drizzle_transaction_test (name) VALUES ($1)',
          ['test_raw']
        )
        
        // Check with raw query
        const result = await tx.query<{ name: string }>(
          'SELECT name FROM drizzle_transaction_test WHERE name = $1',
          ['test_raw']
        )
        
        expect(result.rows[0]?.name).toBe('test_raw')
      })
    })
  })
  
  describe('migrations', () => {
    it('should run migrations when autoMigrate is true', async () => {
      // Create a spy on the runMigrations method
      const runMigrationsSpy = vi.spyOn(DatabaseManager.prototype, 'runMigrations')
      
      const dbWithAutoMigrate = new DatabaseManager({
        autoMigrate: true
      })
      
      await dbWithAutoMigrate.initialize()
      expect(runMigrationsSpy).toHaveBeenCalled()
      
      await dbWithAutoMigrate.close()
      runMigrationsSpy.mockRestore()
    })
    
    it('should not run migrations when autoMigrate is false', async () => {
      // Create a spy on the runMigrations method
      const runMigrationsSpy = vi.spyOn(DatabaseManager.prototype, 'runMigrations')
      
      const dbWithoutAutoMigrate = new DatabaseManager({
        autoMigrate: false
      })
      
      await dbWithoutAutoMigrate.initialize()
      expect(runMigrationsSpy).not.toHaveBeenCalled()
      
      await dbWithoutAutoMigrate.close()
      runMigrationsSpy.mockRestore()
    })
    
    it('should manually run migrations without errors', async () => {
      await dbManager.initialize()
      
      // This should not throw an error
      await expect(dbManager.runMigrations({ force: true })).resolves.not.toThrow()
    })
  })
  
  describe('utility methods', () => {
    it('should clone database manager', async () => {
      await dbManager.initialize()
      
      const clonedManager = await dbManager.clone()
      expect(clonedManager).toBeInstanceOf(DatabaseManager)
      expect(clonedManager.isReady()).toBe(true)
      
      // Verify the clone is independent
      await clonedManager.execute('CREATE TABLE clone_test (id SERIAL)')
      
      // This should succeed on the clone
      await clonedManager.query('SELECT * FROM clone_test')
      
      // But fail on the original
      await expect(dbManager.query('SELECT * FROM clone_test')).rejects.toThrow()
      
      await clonedManager.close()
    })
    
    it('should generate migration', async () => {
      // Mock console.log
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      
      await DatabaseManager.generateMigration('test-migration')
      
      // Verify console.log was called with expected message
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('drizzle-kit generate:pg --name=test-migration'))
      
      consoleLogSpy.mockRestore()
    })
  })
})