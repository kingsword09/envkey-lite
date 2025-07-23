import { PGlite } from '@electric-sql/pglite'
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { readdir } from 'fs/promises'
import { join } from 'path'
import * as schema from './schema'

export interface DatabaseConfig {
  dataDir?: string // undefined for in-memory mode
  extensions?: Record<string, unknown>
  debug?: boolean
  migrationDir?: string // custom migrations directory
  autoMigrate?: boolean // whether to run migrations on initialize
}

export interface QueryResult<T = unknown> {
  rows: T[]
  rowCount: number
}

export interface Transaction {
  query<T>(sql: string, params?: unknown[]): Promise<QueryResult<T>>
  execute(sql: string, params?: unknown[]): Promise<void>
  // Add Drizzle ORM transaction methods
  db: PgliteDatabase
}

export class DatabaseManager {
  private pglite: PGlite | null = null
  private db: PgliteDatabase | null = null
  private config: DatabaseConfig
  private isInitialized = false
  private schema = schema

  constructor(config: DatabaseConfig = {}) {
    this.config = {
      autoMigrate: true,
      migrationDir: join(process.cwd(), 'src/db/migrations'),
      ...config
    }
  }

  /**
   * Initialize the database connection and run migrations
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      // Initialize PGlite
      const pgliteOptions: Record<string, unknown> = {}
      if (this.config.extensions) {
        pgliteOptions.extensions = this.config.extensions
      }
      if (this.config.debug) {
        pgliteOptions.debug = this.config.debug
      }
      
      this.pglite = new PGlite(this.config.dataDir, pgliteOptions)

      // Initialize Drizzle with PGlite
      this.db = drizzle(this.pglite, {
        ...(this.config.debug !== undefined && { logger: this.config.debug }),
        schema: this.schema,
      })

      // Run migrations if autoMigrate is enabled
      if (this.config.autoMigrate) {
        await this.runMigrations()
      }

      this.isInitialized = true
    } catch (error) {
      throw new Error(`Failed to initialize database: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get the Drizzle database instance
   */
  getDb(): PgliteDatabase {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.')
    }
    return this.db
  }

  /**
   * Get the PGlite instance
   */
  getPGlite(): PGlite {
    if (!this.pglite) {
      throw new Error('Database not initialized. Call initialize() first.')
    }
    return this.pglite
  }

  /**
   * Execute a raw SQL query
   */
  async query<T = unknown>(sqlQuery: string, params: unknown[] = []): Promise<QueryResult<T>> {
    if (!this.pglite) {
      throw new Error('Database not initialized. Call initialize() first.')
    }

    try {
      const result = await this.pglite.query(sqlQuery, params)
      return {
        rows: result.rows as T[],
        rowCount: result.rows.length,
      }
    } catch (error) {
      throw new Error(`Query failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Execute a SQL statement without returning results
   */
  async execute(sqlQuery: string, params: unknown[] = []): Promise<void> {
    if (!this.pglite) {
      throw new Error('Database not initialized. Call initialize() first.')
    }

    try {
      if (params.length > 0) {
        // Use query for parameterized statements
        await this.pglite.query(sqlQuery, params)
      } else {
        // Use exec for non-parameterized statements
        await this.pglite.exec(sqlQuery)
      }
    } catch (error) {
      throw new Error(`Execute failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Execute a function within a database transaction
   * This provides both raw SQL transaction support and Drizzle ORM transaction support
   */
  async transaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
    if (!this.pglite || !this.db) {
      throw new Error('Database not initialized. Call initialize() first.')
    }

    // Manual transaction implementation since PGlite's transaction might have issues
    await this.execute('BEGIN')
    
    try {
      // Create a transaction wrapper that includes both raw SQL methods and Drizzle ORM
      const transactionWrapper: Transaction = {
        query: this.query.bind(this),
        execute: this.execute.bind(this),
        db: this.db, // Provide access to Drizzle ORM within transaction
      }

      const result = await callback(transactionWrapper)
      await this.execute('COMMIT')
      return result
    } catch (error) {
      await this.execute('ROLLBACK')
      throw error
    }
  }

  /**
   * Run database migrations
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized')
    }

    try {
      const migrationsPath = join(process.cwd(), 'src/db/migrations')
      
      // Check if migrations directory exists and has files
      try {
        const migrationFiles = await readdir(migrationsPath)
        const sqlFiles = migrationFiles.filter(file => file.endsWith('.sql'))
        
        if (sqlFiles.length > 0) {
          await migrate(this.db, { migrationsFolder: migrationsPath })
        }
      } catch {
        // Migrations directory doesn't exist or is empty, skip migration
        // Silent skip - no logging needed for missing migrations during development
      }
    } catch (error) {
      throw new Error(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Check if database is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.pglite !== null && this.db !== null
  }

  /**
   * Get database health status
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details?: string }> {
    if (!this.isReady()) {
      return { status: 'unhealthy', details: 'Database not initialized' }
    }

    try {
      await this.query('SELECT 1 as health_check')
      return { status: 'healthy' }
    } catch (error) {
      return { 
        status: 'unhealthy', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.pglite) {
      await this.pglite.close()
      this.pglite = null
      this.db = null
      this.isInitialized = false
    }
  }

  /**
   * Reset the database (useful for testing)
   */
  async reset(): Promise<void> {
    if (!this.pglite) {
      throw new Error('Database not initialized. Call initialize() first.')
    }

    try {
      // Get all table names
      const result = await this.query<{ tablename: string }>(`
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
      `)

      // Drop all tables
      for (const row of result.rows) {
        await this.execute(`DROP TABLE IF EXISTS "${row.tablename}" CASCADE`)
      }

      // Re-run migrations
      await this.runMigrations()
    } catch (error) {
      throw new Error(`Reset failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get the schema objects
   * @returns The database schema objects
   */
  getSchema(): typeof schema {
    return this.schema
  }

  /**
   * Create a new database instance with the same configuration
   * Useful for creating isolated database instances
   */
  async clone(): Promise<DatabaseManager> {
    const clonedManager = new DatabaseManager({
      ...this.config,
      // For clones, we typically want in-memory mode
      dataDir: undefined
    })
    await clonedManager.initialize()
    return clonedManager
  }

  /**
   * Generate a database migration using Drizzle Kit
   * This is a utility method that can be used in scripts
   * @param name The name of the migration
   */
  static async generateMigration(_name: string): Promise<void> {
    try {
      // This would typically call drizzle-kit generate command
      // In a real implementation, this would use execa or similar to run the CLI
      
      
    } catch (error) {
      throw new Error(`Migration generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}
