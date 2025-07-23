// Test setup and configuration for envkey-lite

import { beforeAll, afterAll, vi } from 'vitest'
import { DatabaseManager } from '../src/db/manager'

// Create a shared test database instance
let testDb: DatabaseManager | null = null

beforeAll(async () => {
  console.log('Setting up test environment...')
  
  // Set test environment variables
  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only'
  process.env.ENCRYPTION_KEY = 'test-encryption-key-for-testing-only'
  
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

// Helper to seed test database with common data
export async function seedTestDatabase(db: DatabaseManager) {
  const schema = db.getSchema()
  const dbInstance = db.getDb()
  
  // Create test users
  const [adminUser] = await dbInstance.insert(schema.users).values({
    email: 'admin@test.com',
    name: 'Test Admin',
    passwordHash: '$2a$10$test.hash.for.testing.purposes.only',
    role: 'admin'
  }).returning()
  
  const [regularUser] = await dbInstance.insert(schema.users).values({
    email: 'user@test.com',
    name: 'Test User',
    passwordHash: '$2a$10$test.hash.for.testing.purposes.only',
    role: 'user'
  }).returning()
  
  // Create test project
  const [project] = await dbInstance.insert(schema.projects).values({
    name: 'Test Project',
    description: 'A project for testing',
    ownerId: adminUser!.id
  }).returning()
  
  // Create test environments
  const environments = await dbInstance.insert(schema.environments).values([
    { name: 'development', projectId: project!.id },
    { name: 'staging', projectId: project!.id },
    { name: 'production', projectId: project!.id }
  ]).returning()
  
  return {
    users: { admin: adminUser!, regular: regularUser! },
    project: project!,
    environments
  }
}

// Helper to clean test database
export async function cleanTestDatabase(db: DatabaseManager) {
  const schema = db.getSchema()
  const dbInstance = db.getDb()
  
  // Delete in reverse dependency order
  await dbInstance.delete(schema.auditLogs)
  await dbInstance.delete(schema.environmentVariables)
  await dbInstance.delete(schema.environments)
  await dbInstance.delete(schema.projectPermissions)
  await dbInstance.delete(schema.projects)
  await dbInstance.delete(schema.apiKeys)
  await dbInstance.delete(schema.users)
  await dbInstance.delete(schema.systemConfig)
}