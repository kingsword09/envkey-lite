import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseManager } from './manager'
import { 
  users, 
  apiKeys, 
  projects, 
  environments, 
  environmentVariables, 
  projectPermissions, 
  auditLogs, 
  systemConfig,
  type User,
  type NewUser,
  type Project,
  type NewProject,
  type Environment,
  type NewEnvironment,
  type EnvironmentVariable,
  type NewEnvironmentVariable
} from './schema'
import { eq, and } from 'drizzle-orm'

describe('Database Schema', () => {
  let dbManager: DatabaseManager

  beforeEach(async () => {
    dbManager = new DatabaseManager({ debug: false })
    await dbManager.initialize()
  })

  afterEach(async () => {
    if (dbManager.isReady()) {
      await dbManager.close()
    }
  })

  describe('Users table', () => {
    it('should create and query users with proper types', async () => {
      const db = dbManager.getDb()
      
      const newUser: NewUser = {
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: 'hashed_password',
        role: 'admin'
      }

      const [insertedUser] = await db.insert(users).values(newUser).returning()
      expect(insertedUser).toBeDefined()
      expect(insertedUser.email).toBe('test@example.com')
      expect(insertedUser.name).toBe('Test User')
      expect(insertedUser.role).toBe('admin')
      expect(insertedUser.id).toBeDefined()
      expect(insertedUser.createdAt).toBeDefined()
      expect(insertedUser.updatedAt).toBeDefined()

      const queriedUser = await db.select().from(users).where(eq(users.email, 'test@example.com'))
      expect(queriedUser).toHaveLength(1)
      expect(queriedUser[0]!.email).toBe('test@example.com')
    })

    it('should enforce unique email constraint', async () => {
      const db = dbManager.getDb()
      
      const user1: NewUser = {
        email: 'duplicate@example.com',
        name: 'User 1',
        passwordHash: 'hash1'
      }

      const user2: NewUser = {
        email: 'duplicate@example.com',
        name: 'User 2',
        passwordHash: 'hash2'
      }

      await db.insert(users).values(user1)
      
      await expect(
        db.insert(users).values(user2)
      ).rejects.toThrow()
    })

    it('should use default role when not specified', async () => {
      const db = dbManager.getDb()
      
      const newUser: NewUser = {
        email: 'default@example.com',
        name: 'Default User',
        passwordHash: 'hashed_password'
      }

      const [insertedUser] = await db.insert(users).values(newUser).returning()
      expect(insertedUser.role).toBe('user')
    })
  })

  describe('Projects table', () => {
    let testUser: User

    beforeEach(async () => {
      const db = dbManager.getDb()
      const [user] = await db.insert(users).values({
        email: 'owner@example.com',
        name: 'Project Owner',
        passwordHash: 'hash'
      }).returning()
      testUser = user!
    })

    it('should create and query projects with proper relationships', async () => {
      const db = dbManager.getDb()
      
      const newProject: NewProject = {
        name: 'Test Project',
        description: 'A test project',
        ownerId: testUser.id
      }

      const [insertedProject] = await db.insert(projects).values(newProject).returning()
      expect(insertedProject).toBeDefined()
      expect(insertedProject.name).toBe('Test Project')
      expect(insertedProject.ownerId).toBe(testUser.id)

      // Test relationship query
      const projectWithOwner = await db
        .select({
          project: projects,
          owner: users
        })
        .from(projects)
        .innerJoin(users, eq(projects.ownerId, users.id))
        .where(eq(projects.id, insertedProject.id))

      expect(projectWithOwner).toHaveLength(1)
      expect(projectWithOwner[0]!.owner.email).toBe('owner@example.com')
    })

    it('should cascade delete when owner is deleted', async () => {
      const db = dbManager.getDb()
      
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        ownerId: testUser.id
      }).returning()

      // Delete the owner
      await db.delete(users).where(eq(users.id, testUser.id))

      // Project should be deleted due to cascade
      const remainingProjects = await db.select().from(projects).where(eq(projects.id, project.id))
      expect(remainingProjects).toHaveLength(0)
    })
  })

  describe('Environments table', () => {
    let testUser: User
    let testProject: Project

    beforeEach(async () => {
      const db = dbManager.getDb()
      
      const [user] = await db.insert(users).values({
        email: 'env-owner@example.com',
        name: 'Env Owner',
        passwordHash: 'hash'
      }).returning()
      testUser = user!

      const [project] = await db.insert(projects).values({
        name: 'Env Test Project',
        ownerId: testUser.id
      }).returning()
      testProject = project!
    })

    it('should create environments with unique names per project', async () => {
      const db = dbManager.getDb()
      
      const env1: NewEnvironment = {
        name: 'development',
        projectId: testProject.id
      }

      const env2: NewEnvironment = {
        name: 'production',
        projectId: testProject.id
      }

      const [insertedEnv1] = await db.insert(environments).values(env1).returning()
      const [insertedEnv2] = await db.insert(environments).values(env2).returning()

      expect(insertedEnv1.name).toBe('development')
      expect(insertedEnv2.name).toBe('production')
      expect(insertedEnv1.projectId).toBe(testProject.id)
      expect(insertedEnv2.projectId).toBe(testProject.id)
    })

    it('should enforce unique environment names per project', async () => {
      const db = dbManager.getDb()
      
      const env1: NewEnvironment = {
        name: 'development',
        projectId: testProject.id
      }

      const env2: NewEnvironment = {
        name: 'development', // Same name, same project
        projectId: testProject.id
      }

      await db.insert(environments).values(env1)
      
      await expect(
        db.insert(environments).values(env2)
      ).rejects.toThrow()
    })
  })

  describe('Environment Variables table', () => {
    let testUser: User
    let testProject: Project
    let testEnvironment: Environment

    beforeEach(async () => {
      const db = dbManager.getDb()
      
      const [user] = await db.insert(users).values({
        email: 'var-owner@example.com',
        name: 'Var Owner',
        passwordHash: 'hash'
      }).returning()
      testUser = user!

      const [project] = await db.insert(projects).values({
        name: 'Var Test Project',
        ownerId: testUser.id
      }).returning()
      testProject = project!

      const [environment] = await db.insert(environments).values({
        name: 'test',
        projectId: testProject.id
      }).returning()
      testEnvironment = environment!
    })

    it('should create environment variables with proper types', async () => {
      const db = dbManager.getDb()
      
      const newVar: NewEnvironmentVariable = {
        environmentId: testEnvironment.id,
        key: 'DATABASE_URL',
        value: 'postgresql://localhost:5432/test',
        encrypted: false,
        sensitive: true,
        description: 'Database connection string'
      }

      const [insertedVar] = await db.insert(environmentVariables).values(newVar).returning()
      expect(insertedVar).toBeDefined()
      expect(insertedVar.key).toBe('DATABASE_URL')
      expect(insertedVar.value).toBe('postgresql://localhost:5432/test')
      expect(insertedVar.encrypted).toBe(false)
      expect(insertedVar.sensitive).toBe(true)
      expect(insertedVar.description).toBe('Database connection string')
    })

    it('should enforce unique keys per environment', async () => {
      const db = dbManager.getDb()
      
      const var1: NewEnvironmentVariable = {
        environmentId: testEnvironment.id,
        key: 'API_KEY',
        value: 'value1'
      }

      const var2: NewEnvironmentVariable = {
        environmentId: testEnvironment.id,
        key: 'API_KEY', // Same key, same environment
        value: 'value2'
      }

      await db.insert(environmentVariables).values(var1)
      
      await expect(
        db.insert(environmentVariables).values(var2)
      ).rejects.toThrow()
    })

    it('should use default values for boolean fields', async () => {
      const db = dbManager.getDb()
      
      const newVar: NewEnvironmentVariable = {
        environmentId: testEnvironment.id,
        key: 'SIMPLE_VAR',
        value: 'simple_value'
      }

      const [insertedVar] = await db.insert(environmentVariables).values(newVar).returning()
      expect(insertedVar.encrypted).toBe(false)
      expect(insertedVar.sensitive).toBe(false)
    })
  })

  describe('API Keys table', () => {
    let testUser: User

    beforeEach(async () => {
      const db = dbManager.getDb()
      const [user] = await db.insert(users).values({
        email: 'api-user@example.com',
        name: 'API User',
        passwordHash: 'hash'
      }).returning()
      testUser = user!
    })

    it('should create API keys with proper relationships', async () => {
      const db = dbManager.getDb()
      
      const newApiKey = {
        userId: testUser.id,
        name: 'Production API Key',
        keyHash: 'hashed_api_key_value'
      }

      const [insertedKey] = await db.insert(apiKeys).values(newApiKey).returning()
      expect(insertedKey).toBeDefined()
      expect(insertedKey.name).toBe('Production API Key')
      expect(insertedKey.userId).toBe(testUser.id)
      expect(insertedKey.keyHash).toBe('hashed_api_key_value')
      expect(insertedKey.lastUsedAt).toBeNull()
    })

    it('should enforce unique key hash constraint', async () => {
      const db = dbManager.getDb()
      
      const key1 = {
        userId: testUser.id,
        name: 'Key 1',
        keyHash: 'duplicate_hash'
      }

      const key2 = {
        userId: testUser.id,
        name: 'Key 2',
        keyHash: 'duplicate_hash'
      }

      await db.insert(apiKeys).values(key1)
      
      await expect(
        db.insert(apiKeys).values(key2)
      ).rejects.toThrow()
    })
  })

  describe('Project Permissions table', () => {
    let testUser1: User
    let testUser2: User
    let testProject: Project

    beforeEach(async () => {
      const db = dbManager.getDb()
      
      const [user1] = await db.insert(users).values({
        email: 'perm-user1@example.com',
        name: 'Permission User 1',
        passwordHash: 'hash1'
      }).returning()
      testUser1 = user1!

      const [user2] = await db.insert(users).values({
        email: 'perm-user2@example.com',
        name: 'Permission User 2',
        passwordHash: 'hash2'
      }).returning()
      testUser2 = user2!

      const [project] = await db.insert(projects).values({
        name: 'Permission Test Project',
        ownerId: testUser1.id
      }).returning()
      testProject = project!
    })

    it('should create project permissions', async () => {
      const db = dbManager.getDb()
      
      const permission = {
        userId: testUser2.id,
        projectId: testProject.id,
        role: 'editor'
      }

      const [insertedPermission] = await db.insert(projectPermissions).values(permission).returning()
      expect(insertedPermission).toBeDefined()
      expect(insertedPermission.userId).toBe(testUser2.id)
      expect(insertedPermission.projectId).toBe(testProject.id)
      expect(insertedPermission.role).toBe('editor')
    })

    it('should enforce unique user-project combination', async () => {
      const db = dbManager.getDb()
      
      const permission1 = {
        userId: testUser2.id,
        projectId: testProject.id,
        role: 'editor'
      }

      const permission2 = {
        userId: testUser2.id,
        projectId: testProject.id,
        role: 'viewer' // Different role, same user-project
      }

      await db.insert(projectPermissions).values(permission1)
      
      await expect(
        db.insert(projectPermissions).values(permission2)
      ).rejects.toThrow()
    })
  })

  describe('Audit Logs table', () => {
    let testUser: User

    beforeEach(async () => {
      const db = dbManager.getDb()
      const [user] = await db.insert(users).values({
        email: 'audit-user@example.com',
        name: 'Audit User',
        passwordHash: 'hash'
      }).returning()
      testUser = user!
    })

    it('should create audit logs with proper data types', async () => {
      const db = dbManager.getDb()
      
      const auditLog = {
        userId: testUser.id,
        action: 'CREATE_PROJECT',
        resource: 'project',
        resourceId: testUser.id, // Use a valid UUID
        details: { projectName: 'Test Project', description: 'Created via API' },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Test Browser'
      }

      const [insertedLog] = await db.insert(auditLogs).values(auditLog).returning()
      expect(insertedLog).toBeDefined()
      expect(insertedLog.action).toBe('CREATE_PROJECT')
      expect(insertedLog.resource).toBe('project')
      expect(insertedLog.details).toEqual({ projectName: 'Test Project', description: 'Created via API' })
      expect(insertedLog.ipAddress).toBe('192.168.1.1')
      expect(insertedLog.timestamp).toBeDefined()
    })

    it('should allow null user for system actions', async () => {
      const db = dbManager.getDb()
      
      const systemLog = {
        userId: null,
        action: 'SYSTEM_MAINTENANCE',
        resource: 'system',
        details: { type: 'database_cleanup' }
      }

      const [insertedLog] = await db.insert(auditLogs).values(systemLog).returning()
      expect(insertedLog).toBeDefined()
      expect(insertedLog.userId).toBeNull()
      expect(insertedLog.action).toBe('SYSTEM_MAINTENANCE')
    })
  })

  describe('System Config table', () => {
    it('should store and retrieve system configuration', async () => {
      const db = dbManager.getDb()
      
      const config = {
        key: 'app_settings',
        value: {
          maxUsers: 100,
          enableRegistration: true,
          features: ['api_keys', 'audit_logs']
        }
      }

      const [insertedConfig] = await db.insert(systemConfig).values(config).returning()
      expect(insertedConfig).toBeDefined()
      expect(insertedConfig.key).toBe('app_settings')
      expect(insertedConfig.value).toEqual({
        maxUsers: 100,
        enableRegistration: true,
        features: ['api_keys', 'audit_logs']
      })
    })

    it('should enforce primary key constraint on config key', async () => {
      const db = dbManager.getDb()
      
      const config1 = {
        key: 'duplicate_key',
        value: { setting1: 'value1' }
      }

      const config2 = {
        key: 'duplicate_key',
        value: { setting2: 'value2' }
      }

      await db.insert(systemConfig).values(config1)
      
      await expect(
        db.insert(systemConfig).values(config2)
      ).rejects.toThrow()
    })
  })

  describe('Complex queries and relationships', () => {
    let testUser: User
    let testProject: Project
    let testEnvironment: Environment

    beforeEach(async () => {
      const db = dbManager.getDb()
      
      const [user] = await db.insert(users).values({
        email: 'complex-user@example.com',
        name: 'Complex User',
        passwordHash: 'hash'
      }).returning()
      testUser = user!

      const [project] = await db.insert(projects).values({
        name: 'Complex Project',
        ownerId: testUser.id
      }).returning()
      testProject = project!

      const [environment] = await db.insert(environments).values({
        name: 'production',
        projectId: testProject.id
      }).returning()
      testEnvironment = environment!
    })

    it('should query project with all related data', async () => {
      const db = dbManager.getDb()
      
      // Add some environment variables
      await db.insert(environmentVariables).values([
        {
          environmentId: testEnvironment.id,
          key: 'DATABASE_URL',
          value: 'postgresql://localhost:5432/prod',
          sensitive: true
        },
        {
          environmentId: testEnvironment.id,
          key: 'API_KEY',
          value: 'secret-key',
          sensitive: true
        }
      ])

      // Query project with environments and variables
      const projectData = await db
        .select({
          project: projects,
          environment: environments,
          variable: environmentVariables
        })
        .from(projects)
        .leftJoin(environments, eq(projects.id, environments.projectId))
        .leftJoin(environmentVariables, eq(environments.id, environmentVariables.environmentId))
        .where(eq(projects.id, testProject.id))

      expect(projectData.length).toBeGreaterThan(0)
      expect(projectData[0]!.project.name).toBe('Complex Project')
      expect(projectData[0]!.environment?.name).toBe('production')
      expect(projectData[0]!.variable?.key).toBeDefined()
    })

    it('should handle cascading deletes properly', async () => {
      const db = dbManager.getDb()
      
      // Add environment variables
      await db.insert(environmentVariables).values({
        environmentId: testEnvironment.id,
        key: 'TEST_VAR',
        value: 'test_value'
      })

      // Delete the project (should cascade to environments and variables)
      await db.delete(projects).where(eq(projects.id, testProject.id))

      // Check that environments and variables are also deleted
      const remainingEnvironments = await db.select().from(environments).where(eq(environments.projectId, testProject.id))
      const remainingVariables = await db.select().from(environmentVariables).where(eq(environmentVariables.environmentId, testEnvironment.id))

      expect(remainingEnvironments).toHaveLength(0)
      expect(remainingVariables).toHaveLength(0)
    })
  })
})