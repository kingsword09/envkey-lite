import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseManager } from './manager'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'

describe('Database Migrations', () => {
  let dbManager: DatabaseManager

  beforeEach(async () => {
    dbManager = new DatabaseManager({ debug: false })
  })

  afterEach(async () => {
    if (dbManager.isReady()) {
      await dbManager.close()
    }
  })

  describe('Migration system', () => {
    it('should run migrations during initialization', async () => {
      await dbManager.initialize()
      
      // Check that migration tracking table exists
      const result = await dbManager.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'drizzle' 
          AND table_name = '__drizzle_migrations'
        ) as exists
      `)
      
      expect(result.rows[0]!.exists).toBe(true)
    })

    it('should create all expected tables from migrations', async () => {
      await dbManager.initialize()
      
      const expectedTables = [
        'users',
        'api_keys',
        'projects',
        'environments',
        'environment_variables',
        'project_permissions',
        'audit_logs',
        'system_config'
      ]

      for (const tableName of expectedTables) {
        const result = await dbManager.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          ) as exists
        `, [tableName])
        
        expect(result.rows[0]!.exists).toBe(true)
      }
    })

    it('should create all expected indexes', async () => {
      await dbManager.initialize()
      
      const expectedIndexes = [
        'idx_api_keys_user_id',
        'idx_audit_logs_user_id',
        'idx_audit_logs_timestamp',
        'idx_audit_logs_resource',
        'idx_environment_variables_environment_id',
        'idx_environments_project_id',
        'idx_project_permissions_user_id',
        'idx_project_permissions_project_id',
        'idx_projects_owner_id'
      ]

      for (const indexName of expectedIndexes) {
        const result = await dbManager.query(`
          SELECT EXISTS (
            SELECT FROM pg_indexes 
            WHERE schemaname = 'public' 
            AND indexname = $1
          ) as exists
        `, [indexName])
        
        expect(result.rows[0]!.exists).toBe(true)
      }
    })

    it('should create all expected constraints', async () => {
      await dbManager.initialize()
      
      const expectedConstraints = [
        'users_email_unique',
        'api_keys_key_hash_unique',
        'environments_project_id_name_unique',
        'environment_variables_environment_id_key_unique',
        'project_permissions_user_id_project_id_unique'
      ]

      for (const constraintName of expectedConstraints) {
        const result = await dbManager.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.table_constraints 
            WHERE table_schema = 'public' 
            AND constraint_name = $1
          ) as exists
        `, [constraintName])
        
        expect(result.rows[0]!.exists).toBe(true)
      }
    })

    it('should create all expected foreign key constraints', async () => {
      await dbManager.initialize()
      
      const expectedForeignKeys = [
        'api_keys_user_id_users_id_fk',
        'audit_logs_user_id_users_id_fk',
        'environment_variables_environment_id_environments_id_fk',
        'environments_project_id_projects_id_fk',
        'project_permissions_user_id_users_id_fk',
        'project_permissions_project_id_projects_id_fk',
        'projects_owner_id_users_id_fk'
      ]

      for (const fkName of expectedForeignKeys) {
        const result = await dbManager.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.table_constraints 
            WHERE table_schema = 'public' 
            AND constraint_name = $1
            AND constraint_type = 'FOREIGN KEY'
          ) as exists
        `, [fkName])
        
        expect(result.rows[0]!.exists).toBe(true)
      }
    })

    it('should track migration execution', async () => {
      await dbManager.initialize()
      
      // Check that migration was recorded
      const result = await dbManager.query(`
        SELECT hash, created_at 
        FROM drizzle.__drizzle_migrations 
        ORDER BY created_at DESC 
        LIMIT 1
      `)
      
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]!.hash).toBeDefined()
      expect(result.rows[0]!.created_at).toBeDefined()
    })

    it('should not run migrations twice', async () => {
      await dbManager.initialize()
      
      // Get initial migration count
      const initialResult = await dbManager.query(`
        SELECT COUNT(*) as count 
        FROM drizzle.__drizzle_migrations
      `)
      const initialCount = parseInt(initialResult.rows[0]!.count)

      // Close and reinitialize
      await dbManager.close()
      dbManager = new DatabaseManager({ debug: false })
      await dbManager.initialize()

      // Check that no new migrations were run
      const finalResult = await dbManager.query(`
        SELECT COUNT(*) as count 
        FROM drizzle.__drizzle_migrations
      `)
      const finalCount = parseInt(finalResult.rows[0]!.count)

      expect(finalCount).toBe(initialCount)
    })
  })

  describe('Migration files validation', () => {
    it('should have valid migration files in the migrations directory', async () => {
      const migrationsPath = join(process.cwd(), 'src/db/migrations')
      
      try {
        const files = await readdir(migrationsPath)
        const sqlFiles = files.filter(file => file.endsWith('.sql'))
        
        expect(sqlFiles.length).toBeGreaterThan(0)
        
        // Check that each migration file has valid SQL
        for (const file of sqlFiles) {
          const filePath = join(migrationsPath, file)
          const content = await readFile(filePath, 'utf-8')
          
          expect(content).toBeTruthy()
          expect(content).toContain('CREATE TABLE')
          expect(content).toContain('statement-breakpoint')
        }
      } catch (error) {
        throw new Error(`Migration files validation failed: ${error}`)
      }
    })

    it('should have proper migration file naming convention', async () => {
      const migrationsPath = join(process.cwd(), 'src/db/migrations')
      
      try {
        const files = await readdir(migrationsPath)
        const sqlFiles = files.filter(file => file.endsWith('.sql'))
        
        for (const file of sqlFiles) {
          // Check timestamp_name.sql format
          const timestampPattern = /^\d{14}_\w+\.sql$/
          expect(timestampPattern.test(file)).toBe(true)
        }
      } catch (error) {
        throw new Error(`Migration file naming validation failed: ${error}`)
      }
    })
  })

  describe('Schema validation', () => {
    it('should validate column types and constraints', async () => {
      await dbManager.initialize()
      
      // Test users table structure
      const usersColumns = await dbManager.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
        ORDER BY ordinal_position
      `)

      const columnMap = new Map(
        usersColumns.rows.map(row => [row.column_name, row])
      )

      // Validate key columns
      expect(columnMap.get('id')?.data_type).toBe('uuid')
      expect(columnMap.get('id')?.is_nullable).toBe('NO')
      expect(columnMap.get('email')?.data_type).toBe('character varying')
      expect(columnMap.get('email')?.is_nullable).toBe('NO')
      expect(columnMap.get('role')?.column_default).toContain('user')
    })

    it('should validate foreign key relationships', async () => {
      await dbManager.initialize()
      
      // Test that foreign keys are properly set up
      const foreignKeys = await dbManager.query(`
        SELECT
          tc.constraint_name,
          tc.table_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          rc.delete_rule
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        JOIN information_schema.referential_constraints AS rc
          ON tc.constraint_name = rc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        ORDER BY tc.table_name, tc.constraint_name
      `)

      expect(foreignKeys.rows.length).toBeGreaterThan(0)
      
      // Check specific foreign key relationships
      const fkMap = new Map(
        foreignKeys.rows.map(row => [row.constraint_name, row])
      )

      // api_keys -> users
      const apiKeysFk = fkMap.get('api_keys_user_id_users_id_fk')
      expect(apiKeysFk?.table_name).toBe('api_keys')
      expect(apiKeysFk?.column_name).toBe('user_id')
      expect(apiKeysFk?.foreign_table_name).toBe('users')
      expect(apiKeysFk?.foreign_column_name).toBe('id')
      expect(apiKeysFk?.delete_rule).toBe('CASCADE')

      // projects -> users
      const projectsFk = fkMap.get('projects_owner_id_users_id_fk')
      expect(projectsFk?.table_name).toBe('projects')
      expect(projectsFk?.column_name).toBe('owner_id')
      expect(projectsFk?.foreign_table_name).toBe('users')
      expect(projectsFk?.delete_rule).toBe('CASCADE')
    })

    it('should validate unique constraints', async () => {
      await dbManager.initialize()
      
      const uniqueConstraints = await dbManager.query(`
        SELECT
          tc.constraint_name,
          tc.table_name,
          string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as columns
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'UNIQUE'
        AND tc.table_schema = 'public'
        GROUP BY tc.constraint_name, tc.table_name
        ORDER BY tc.table_name, tc.constraint_name
      `)

      const constraintMap = new Map(
        uniqueConstraints.rows.map(row => [row.constraint_name, row])
      )

      // Check specific unique constraints
      expect(constraintMap.get('users_email_unique')?.columns).toBe('email')
      expect(constraintMap.get('api_keys_key_hash_unique')?.columns).toBe('key_hash')
      expect(constraintMap.get('environments_project_id_name_unique')?.columns).toBe('project_id, name')
    })

    it('should validate index creation', async () => {
      await dbManager.initialize()
      
      const indexes = await dbManager.query(`
        SELECT
          indexname,
          tablename,
          indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
        AND indexname LIKE 'idx_%'
        ORDER BY tablename, indexname
      `)

      expect(indexes.rows.length).toBeGreaterThan(0)
      
      // Check that performance-critical indexes exist
      const indexNames = indexes.rows.map(row => row.indexname)
      expect(indexNames).toContain('idx_api_keys_user_id')
      expect(indexNames).toContain('idx_audit_logs_timestamp')
      expect(indexNames).toContain('idx_environment_variables_environment_id')
      expect(indexNames).toContain('idx_environments_project_id')
    })
  })

  describe('Database reset functionality', () => {
    it('should execute reset without errors', async () => {
      await dbManager.initialize()
      
      // Verify database is initialized
      expect(dbManager.isReady()).toBe(true)

      // Reset should not throw an error
      await expect(dbManager.reset()).resolves.not.toThrow()
      
      // Database should still be ready after reset
      expect(dbManager.isReady()).toBe(true)
    })
  })
})