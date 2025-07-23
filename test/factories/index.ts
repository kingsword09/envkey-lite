// Test data factories for envkey-lite

import { v4 as uuidv4 } from 'uuid'
import type { 
  User, 
  Project, 
  Environment, 
  EnvironmentVariable, 
  ApiKey, 
  AuditLog,
  ProjectPermission 
} from '../../src/types'

// User factory
export const createUserData = (overrides: Partial<User> = {}): Omit<User, 'id' | 'createdAt' | 'updatedAt'> => ({
  email: `test-${Date.now()}@example.com`,
  name: 'Test User',
  passwordHash: 'test-password-123',
  role: 'user',
  ...overrides
})

export const createUser = (overrides: Partial<User> = {}): User => ({
  id: uuidv4(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...createUserData(overrides)
})

// Project factory
export const createProjectData = (overrides: Partial<Project> = {}): Omit<Project, 'id' | 'createdAt' | 'updatedAt'> => ({
  name: `Test Project ${Date.now()}`,
  description: 'A test project',
  ownerId: uuidv4(),
  ...overrides
})

export const createProject = (overrides: Partial<Project> = {}): Project => ({
  id: uuidv4(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...createProjectData(overrides)
})

// Environment factory
export const createEnvironmentData = (overrides: Partial<Environment> = {}): Omit<Environment, 'id' | 'createdAt' | 'updatedAt'> => ({
  name: 'development',
  projectId: uuidv4(),
  ...overrides
})

export const createEnvironment = (overrides: Partial<Environment> = {}): Environment => ({
  id: uuidv4(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...createEnvironmentData(overrides)
})

// Environment Variable factory
export const createEnvironmentVariableData = (overrides: Partial<EnvironmentVariable> = {}): Omit<EnvironmentVariable, 'id' | 'createdAt' | 'updatedAt'> => ({
  environmentId: uuidv4(),
  key: `TEST_VAR_${Date.now()}`,
  value: 'test-value',
  encrypted: false,
  sensitive: false,
  description: 'A test environment variable',
  ...overrides
})

export const createEnvironmentVariable = (overrides: Partial<EnvironmentVariable> = {}): EnvironmentVariable => ({
  id: uuidv4(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...createEnvironmentVariableData(overrides)
})

// API Key factory
export const createApiKeyData = (overrides: Partial<ApiKey> = {}): Omit<ApiKey, 'id' | 'createdAt'> => ({
  userId: uuidv4(),
  name: `Test API Key ${Date.now()}`,
  keyHash: '$2a$10$test.hash.for.api.key.testing.purposes',
  lastUsedAt: null,
  ...overrides
})

export const createApiKey = (overrides: Partial<ApiKey> = {}): ApiKey => ({
  id: uuidv4(),
  createdAt: new Date(),
  ...createApiKeyData(overrides)
})

// Project Permission factory
export const createProjectPermissionData = (overrides: Partial<ProjectPermission> = {}): Omit<ProjectPermission, 'id' | 'createdAt'> => ({
  userId: uuidv4(),
  projectId: uuidv4(),
  role: 'viewer',
  ...overrides
})

export const createProjectPermission = (overrides: Partial<ProjectPermission> = {}): ProjectPermission => ({
  id: uuidv4(),
  createdAt: new Date(),
  ...createProjectPermissionData(overrides)
})

// Audit Log factory
export const createAuditLogData = (overrides: Partial<AuditLog> = {}): Omit<AuditLog, 'id' | 'timestamp'> => ({
  userId: uuidv4(),
  action: 'CREATE',
  resource: 'project',
  resourceId: uuidv4(),
  details: { test: 'data' },
  ipAddress: '127.0.0.1',
  userAgent: 'Test Agent',
  ...overrides
})

export const createAuditLog = (overrides: Partial<AuditLog> = {}): AuditLog => ({
  id: uuidv4(),
  timestamp: new Date(),
  ...createAuditLogData(overrides)
})

// Batch factories for creating multiple records
export const createUsers = (count: number, overrides: Partial<User> = {}): User[] => {
  return Array.from({ length: count }, (_, index) => 
    createUser({ 
      ...overrides, 
      email: `test-user-${index}-${Date.now()}@example.com`,
      name: `Test User ${index + 1}`
    })
  )
}

export const createProjects = (count: number, ownerId: string, overrides: Partial<Project> = {}): Project[] => {
  return Array.from({ length: count }, (_, index) => 
    createProject({ 
      ...overrides, 
      ownerId,
      name: `Test Project ${index + 1} ${Date.now()}`
    })
  )
}

export const createEnvironments = (count: number, projectId: string, overrides: Partial<Environment> = {}): Environment[] => {
  const envNames = ['development', 'staging', 'production', 'test']
  return Array.from({ length: count }, (_, index) => 
    createEnvironment({ 
      ...overrides, 
      projectId,
      name: envNames[index] || `env-${index + 1}`
    })
  )
}

export const createEnvironmentVariables = (count: number, environmentId: string, overrides: Partial<EnvironmentVariable> = {}): EnvironmentVariable[] => {
  return Array.from({ length: count }, (_, index) => 
    createEnvironmentVariable({ 
      ...overrides, 
      environmentId,
      key: `TEST_VAR_${index + 1}_${Date.now()}`,
      value: `test-value-${index + 1}`
    })
  )
}

// Seed data for consistent testing
export const seedData = {
  admin: createUser({
    email: 'admin@test.com',
    name: 'Test Admin',
    role: 'admin'
  }),
  
  regularUser: createUser({
    email: 'user@test.com',
    name: 'Test User',
    role: 'user'
  }),
  
  testProject: createProject({
    name: 'Test Project',
    description: 'A project for testing'
  }),
  
  environments: {
    development: createEnvironment({ name: 'development' }),
    staging: createEnvironment({ name: 'staging' }),
    production: createEnvironment({ name: 'production' })
  },
  
  variables: {
    simple: createEnvironmentVariable({
      key: 'SIMPLE_VAR',
      value: 'simple-value',
      encrypted: false,
      sensitive: false
    }),
    
    sensitive: createEnvironmentVariable({
      key: 'SECRET_KEY',
      value: 'super-secret-value',
      encrypted: true,
      sensitive: true
    }),
    
    encrypted: createEnvironmentVariable({
      key: 'API_TOKEN',
      value: 'encrypted-token-value',
      encrypted: true,
      sensitive: true
    })
  }
}

// Helper to create a complete project setup with environments and variables
export const createCompleteProjectSetup = (ownerId: string) => {
  const project = createProject({ ownerId })
  const environments = createEnvironments(3, project.id)
  const variables = environments.map(env => 
    createEnvironmentVariables(5, env.id)
  ).flat()
  
  return {
    project,
    environments,
    variables,
    permissions: [
      createProjectPermission({
        userId: ownerId,
        projectId: project.id,
        role: 'owner'
      })
    ]
  }
}

// Helper to create test database with seed data
export const createTestDatabase = async (dbManager: unknown) => {
  const db = dbManager.getDb()
  const schema = dbManager.getSchema()
  
  // Create admin user
  const [adminUser] = await db.insert(schema.users).values({
    email: seedData.admin.email,
    name: seedData.admin.name,
    passwordHash: seedData.admin.passwordHash,
    role: seedData.admin.role
  }).returning()
  
  // Create regular user
  const [regularUser] = await db.insert(schema.users).values({
    email: seedData.regularUser.email,
    name: seedData.regularUser.name,
    passwordHash: seedData.regularUser.passwordHash,
    role: seedData.regularUser.role
  }).returning()
  
  // Create test project
  const [project] = await db.insert(schema.projects).values({
    name: seedData.testProject.name,
    description: seedData.testProject.description,
    ownerId: adminUser!.id
  }).returning()
  
  // Create environments
  const envs = await db.insert(schema.environments).values([
    { name: 'development', projectId: project!.id },
    { name: 'staging', projectId: project!.id },
    { name: 'production', projectId: project!.id }
  ]).returning()
  
  // Create some test variables
  const variables = await db.insert(schema.environmentVariables).values([
    {
      environmentId: envs[0]!.id,
      key: 'DATABASE_URL',
      value: 'postgresql://localhost:5432/test',
      encrypted: false,
      sensitive: true
    },
    {
      environmentId: envs[0]!.id,
      key: 'API_KEY',
      value: 'test-api-key',
      encrypted: true,
      sensitive: true
    },
    {
      environmentId: envs[1]!.id,
      key: 'NODE_ENV',
      value: 'staging',
      encrypted: false,
      sensitive: false
    }
  ]).returning()
  
  return {
    users: { admin: adminUser!, regular: regularUser! },
    project: project!,
    environments: envs,
    variables
  }
}