// Test setup and configuration for envkey-lite

import { beforeAll, afterAll, vi } from 'vitest'
import { DatabaseManager } from '../src/db/manager'

// Create a shared test database instance
let testDb: DatabaseManager | null = null

beforeAll(async () => {
  console.log('Setting up test environment...')
  
  // Create in-memory database for testing
  testDb = new DatabaseManager({
    debug: false,
    autoMigrate: false // We'll manually run migrations when needed
  })
  
  // Initialize but don't run migrations yet
  await testDb.initialize()
})

afterAll(async () => {
  console.log('Cleaning up test environment...')
  
  // Close database connection
  if (testDb?.isReady()) {
    await testDb.close()
    testDb = null
  }
})

// Export the test database for use in tests
export function getTestDb(): DatabaseManager {
  if (!testDb) {
    throw new Error('Test database not initialized')
  }
  return testDb
}

// Helper to create isolated test database instances
export async function createIsolatedTestDb(): Promise<DatabaseManager> {
  const db = new DatabaseManager({
    debug: false,
    autoMigrate: false
  })
  await db.initialize()
  return db
}