import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EnvironmentVariableService, SetVariableOptions } from './environment.service'
import { CryptoService } from './crypto.service'
import { DatabaseManager } from '../db/manager'
import { environments, projects, users } from '../db/schema'

// Mock data
const mockUserId = '550e8400-e29b-41d4-a716-446655440000'
const mockProjectId = '550e8400-e29b-41d4-a716-446655440001'
const mockEnvironmentId = '550e8400-e29b-41d4-a716-446655440002'

describe('EnvironmentVariableService', () => {
  let service: EnvironmentVariableService
  let dbManager: DatabaseManager
  let cryptoService: CryptoService

  beforeEach(async () => {
    // Create in-memory database for testing
    dbManager = new DatabaseManager({
      debug: false,
      autoMigrate: true,
    })
    await dbManager.initialize()

    // Initialize crypto service
    cryptoService = new CryptoService(dbManager)
    await cryptoService.initialize()

    // Create service instance
    service = new EnvironmentVariableService(dbManager, cryptoService)

    // Set up test data
    await setupTestData()
  })

  afterEach(async () => {
    if (dbManager?.isReady()) {
      await dbManager.close()
    }
  })

  async function setupTestData() {
    const db = dbManager.getDb()

    // Create test user
    await db.insert(users).values({
      id: mockUserId,
      email: 'test@example.com',
      name: 'Test User',
      passwordHash: 'hashed_password',
      role: 'user',
    })

    // Create test project
    await db.insert(projects).values({
      id: mockProjectId,
      name: 'Test Project',
      description: 'A test project',
      ownerId: mockUserId,
    })

    // Create test environment
    await db.insert(environments).values({
      id: mockEnvironmentId,
      name: 'test',
      projectId: mockProjectId,
    })
  }

  describe('setVariable', () => {
    it('should create a new environment variable', async () => {
      const result = await service.setVariable(mockEnvironmentId, 'TEST_VAR', 'test_value')

      expect(result).toMatchObject({
        environmentId: mockEnvironmentId,
        key: 'TEST_VAR',
        value: 'test_value',
        encrypted: false,
        sensitive: false,
      })
      expect(result.id).toBeDefined()
      expect(result.createdAt).toBeDefined()
    })

    it('should update an existing environment variable', async () => {
      // Create initial variable
      await service.setVariable(mockEnvironmentId, 'TEST_VAR', 'initial_value')

      // Update the variable
      const result = await service.setVariable(mockEnvironmentId, 'TEST_VAR', 'updated_value')

      expect(result.value).toBe('updated_value')
      expect(result.updatedAt).toBeDefined()
    })

    it('should encrypt sensitive variables automatically', async () => {
      const result = await service.setVariable(mockEnvironmentId, 'API_SECRET', 'secret_value')

      expect(result.sensitive).toBe(true)
      expect(result.encrypted).toBe(true)
      expect(result.value).toBe('secret_value') // Should return decrypted value
    })

    it('should respect explicit sensitive flag', async () => {
      const options: SetVariableOptions = { sensitive: true }
      const result = await service.setVariable(
        mockEnvironmentId,
        'NORMAL_VAR',
        'normal_value',
        options
      )

      expect(result.sensitive).toBe(true)
      expect(result.encrypted).toBe(true)
    })

    it('should throw error for invalid environment ID', async () => {
      await expect(service.setVariable('invalid-id', 'TEST_VAR', 'test_value')).rejects.toThrow(
        'Invalid environment ID'
      )
    })

    it('should throw error for empty key', async () => {
      await expect(service.setVariable(mockEnvironmentId, '', 'test_value')).rejects.toThrow(
        'Variable key cannot be empty'
      )
    })
  })

  describe('getVariable', () => {
    beforeEach(async () => {
      // Set up test variables
      await service.setVariable(mockEnvironmentId, 'NORMAL_VAR', 'normal_value')
      await service.setVariable(mockEnvironmentId, 'SECRET_VAR', 'secret_value', {
        sensitive: true,
      })
    })

    it('should retrieve a normal variable', async () => {
      const result = await service.getVariable(mockEnvironmentId, 'NORMAL_VAR')

      expect(result).toMatchObject({
        key: 'NORMAL_VAR',
        value: 'normal_value',
        encrypted: false,
        sensitive: false,
      })
    })

    it('should retrieve and decrypt a sensitive variable', async () => {
      const result = await service.getVariable(mockEnvironmentId, 'SECRET_VAR')

      expect(result).toMatchObject({
        key: 'SECRET_VAR',
        value: 'secret_value',
        encrypted: true,
        sensitive: true,
      })
    })

    it('should return null for non-existent variable', async () => {
      const result = await service.getVariable(mockEnvironmentId, 'NON_EXISTENT')

      expect(result).toBeNull()
    })
  })

  describe('listVariables', () => {
    beforeEach(async () => {
      // Set up test variables
      await service.setVariable(mockEnvironmentId, 'VAR_A', 'value_a')
      await service.setVariable(mockEnvironmentId, 'VAR_B', 'value_b')
      await service.setVariable(mockEnvironmentId, 'SECRET_VAR', 'secret_value', {
        sensitive: true,
      })
    })

    it('should list all variables in an environment', async () => {
      const result = await service.listVariables(mockEnvironmentId)

      expect(result).toHaveLength(3)
      expect(result.map(v => v.key).sort()).toEqual(['SECRET_VAR', 'VAR_A', 'VAR_B'])
    })

    it('should filter variables by pattern', async () => {
      const result = await service.listVariables(mockEnvironmentId, 'VAR')

      expect(result.length).toBeGreaterThan(0)
      result.forEach(variable => {
        expect(variable.key).toContain('VAR')
      })
    })

    it('should decrypt sensitive variables', async () => {
      const result = await service.listVariables(mockEnvironmentId)
      const secretVar = result.find(v => v.key === 'SECRET_VAR')

      expect(secretVar?.value).toBe('secret_value')
      expect(secretVar?.encrypted).toBe(true)
      expect(secretVar?.sensitive).toBe(true)
    })
  })

  describe('deleteVariable', () => {
    beforeEach(async () => {
      await service.setVariable(mockEnvironmentId, 'TEST_VAR', 'test_value')
    })

    it('should delete an existing variable', async () => {
      const result = await service.deleteVariable(mockEnvironmentId, 'TEST_VAR')

      expect(result).toBe(true)

      // Verify variable is deleted
      const variable = await service.getVariable(mockEnvironmentId, 'TEST_VAR')
      expect(variable).toBeNull()
    })

    it('should return false for non-existent variable', async () => {
      const result = await service.deleteVariable(mockEnvironmentId, 'NON_EXISTENT')

      expect(result).toBe(false)
    })
  })

  describe('setVariables', () => {
    it('should set multiple variables at once', async () => {
      const variables = {
        VAR_1: 'value_1',
        VAR_2: 'value_2',
        VAR_3: 'value_3',
      }

      const count = await service.setVariables(mockEnvironmentId, variables)

      expect(count).toBe(3)

      // Verify all variables were created
      const result = await service.listVariables(mockEnvironmentId)
      expect(result).toHaveLength(3)
    })

    it('should skip empty keys', async () => {
      const variables = {
        VAR_1: 'value_1',
        '': 'empty_key',
        '   ': 'whitespace_key',
        VAR_2: 'value_2',
      }

      const count = await service.setVariables(mockEnvironmentId, variables)

      expect(count).toBe(2) // Only VAR_1 and VAR_2 should be processed
    })
  })

  describe('exportVariables', () => {
    beforeEach(async () => {
      await service.setVariable(mockEnvironmentId, 'VAR_A', 'value_a')
      await service.setVariable(mockEnvironmentId, 'VAR_B', 'value with spaces')
    })

    it('should export variables as JSON', async () => {
      const result = await service.exportVariables(mockEnvironmentId, 'json')
      const parsed = JSON.parse(result)

      expect(parsed).toHaveProperty('VAR_A', 'value_a')
      expect(parsed).toHaveProperty('VAR_B', 'value with spaces')
    })

    it('should export variables as dotenv format', async () => {
      const result = await service.exportVariables(mockEnvironmentId, 'dotenv')

      expect(result).toContain('VAR_A=value_a')
      expect(result).toContain('VAR_B="value with spaces"')
    })
  })

  describe('importVariables', () => {
    it('should import variables from JSON', async () => {
      const jsonData = JSON.stringify({
        IMPORTED_VAR_1: 'value_1',
        IMPORTED_VAR_2: 'value_2',
      })

      const result = await service.importVariables(mockEnvironmentId, jsonData, 'json')

      expect(result.imported).toBe(2)
      expect(result.skipped).toBe(0)
      expect(result.errors).toHaveLength(0)
    })

    it('should handle invalid JSON gracefully', async () => {
      const invalidJson = '{ invalid json }'

      await expect(service.importVariables(mockEnvironmentId, invalidJson, 'json')).rejects.toThrow(
        'Import failed'
      )
    })
  })
})
