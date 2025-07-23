import { and, eq, like, sql } from 'drizzle-orm'
import { DatabaseManager } from '../db/manager'
import {
  EnvironmentVariable,
  NewEnvironmentVariable,
  environmentVariables,
  environments,
} from '../db/schema'
import { CryptoService } from './crypto.service'

export interface SetVariableOptions {
  sensitive?: boolean
  description?: string
}

export type ExportFormat = 'json' | 'dotenv' | 'yaml'
export type ImportFormat = 'json' | 'dotenv' | 'yaml'

export interface ImportResult {
  imported: number
  skipped: number
  errors: Array<{ key: string; error: string }>
}

/**
 * EnvironmentVariableService provides methods for managing environment variables
 * including CRUD operations, encryption of sensitive values, and import/export functionality
 */
export class EnvironmentVariableService {
  private dbManager: DatabaseManager
  private cryptoService: CryptoService

  /**
   * Creates a new EnvironmentVariableService instance
   *
   * @param dbManager - The database manager instance
   * @param cryptoService - The crypto service for encrypting sensitive values
   */
  constructor(dbManager: DatabaseManager, cryptoService: CryptoService) {
    this.dbManager = dbManager
    this.cryptoService = cryptoService
  }

  /**
   * Set an environment variable
   *
   * @param envId - Environment ID
   * @param key - Variable key
   * @param value - Variable value
   * @param options - Additional options (sensitive flag, description)
   * @returns The created or updated environment variable
   * @throws Error if environment not found
   */
  async setVariable(
    envId: string,
    key: string,
    value: string,
    options: SetVariableOptions = {}
  ): Promise<EnvironmentVariable> {
    // Validate environment ID
    if (!this.isValidUuid(envId)) {
      throw new Error(`Invalid environment ID: ${envId}`)
    }

    // Check if environment exists
    const environmentExists = await this.environmentExists(envId)
    if (!environmentExists) {
      throw new Error(`Environment with ID ${envId} not found`)
    }

    // Validate key
    if (!key || key.trim() === '') {
      throw new Error('Variable key cannot be empty')
    }

    // Normalize key (trim whitespace)
    const normalizedKey = key.trim()

    // Determine if value should be encrypted
    const isSensitive =
      options.sensitive !== undefined
        ? options.sensitive
        : this.cryptoService.isSensitiveValue(normalizedKey)

    // Encrypt value if sensitive
    let processedValue = value
    let encrypted = false

    if (isSensitive) {
      processedValue = await this.cryptoService.encrypt(value)
      encrypted = true
    }

    const db = this.dbManager.getDb()

    // Check if variable already exists
    const existingVar = await db
      .select()
      .from(environmentVariables)
      .where(
        and(
          eq(environmentVariables.environmentId, envId),
          eq(environmentVariables.key, normalizedKey)
        )
      )

    if (existingVar.length > 0) {
      // Update existing variable
      const [updatedVar] = await db
        .update(environmentVariables)
        .set({
          value: processedValue,
          encrypted,
          sensitive: isSensitive,
          description: options.description || null,
          updatedAt: new Date(),
        })
        .where(eq(environmentVariables.id, existingVar[0].id))
        .returning()

      if (!updatedVar) {
        throw new Error(`Failed to update variable ${normalizedKey}`)
      }

      // Return with decrypted value for API response
      return {
        ...updatedVar,
        value: encrypted ? value : updatedVar.value,
      }
    } else {
      // Create new variable
      const newVariable: NewEnvironmentVariable = {
        environmentId: envId,
        key: normalizedKey,
        value: processedValue,
        encrypted,
        sensitive: isSensitive,
        description: options.description || null,
      }

      const [createdVar] = await db.insert(environmentVariables).values(newVariable).returning()

      if (!createdVar) {
        throw new Error(`Failed to create variable ${normalizedKey}`)
      }

      // Return with decrypted value for API response
      return {
        ...createdVar,
        value: encrypted ? value : createdVar.value,
      }
    }
  }

  /**
   * Get an environment variable
   *
   * @param envId - Environment ID
   * @param key - Variable key
   * @returns The environment variable or null if not found
   * @throws Error if environment not found
   */
  async getVariable(envId: string, key: string): Promise<EnvironmentVariable | null> {
    // Validate environment ID
    if (!this.isValidUuid(envId)) {
      throw new Error(`Invalid environment ID: ${envId}`)
    }

    // Check if environment exists
    const environmentExists = await this.environmentExists(envId)
    if (!environmentExists) {
      throw new Error(`Environment with ID ${envId} not found`)
    }

    const db = this.dbManager.getDb()

    const result = await db
      .select()
      .from(environmentVariables)
      .where(
        and(eq(environmentVariables.environmentId, envId), eq(environmentVariables.key, key.trim()))
      )

    if (result.length === 0) {
      return null
    }

    const variable = result[0]

    // Decrypt value if encrypted
    if (variable.encrypted) {
      try {
        const decryptedValue = await this.cryptoService.decrypt(variable.value)
        return {
          ...variable,
          value: decryptedValue,
        }
      } catch (error) {
        throw new Error(
          `Failed to decrypt variable ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      }
    }

    return variable
  }

  /**
   * List all environment variables for an environment
   *
   * @param envId - Environment ID
   * @param pattern - Optional pattern to filter variables by key
   * @returns Array of environment variables
   * @throws Error if environment not found
   */
  async listVariables(envId: string, pattern?: string): Promise<EnvironmentVariable[]> {
    // Validate environment ID
    if (!this.isValidUuid(envId)) {
      throw new Error(`Invalid environment ID: ${envId}`)
    }

    // Check if environment exists
    const environmentExists = await this.environmentExists(envId)
    if (!environmentExists) {
      throw new Error(`Environment with ID ${envId} not found`)
    }

    const db = this.dbManager.getDb()

    const variables = await db
      .select()
      .from(environmentVariables)
      .where(
        pattern
          ? and(
              eq(environmentVariables.environmentId, envId),
              like(environmentVariables.key, `%${pattern}%`)
            )
          : eq(environmentVariables.environmentId, envId)
      )
      .orderBy(environmentVariables.key)

    // Decrypt encrypted values
    return Promise.all(
      variables.map(async variable => {
        if (variable.encrypted) {
          try {
            const decryptedValue = await this.cryptoService.decrypt(variable.value)
            return {
              ...variable,
              value: decryptedValue,
            }
          } catch (error) {
            console.error(`Failed to decrypt variable ${variable.key}:`, error)
            // Return with placeholder for failed decryption
            return {
              ...variable,
              value: '[DECRYPTION_FAILED]',
            }
          }
        }
        return variable
      })
    )
  }

  /**
   * Delete an environment variable
   *
   * @param envId - Environment ID
   * @param key - Variable key
   * @returns True if variable was deleted, false if it didn't exist
   * @throws Error if environment not found
   */
  async deleteVariable(envId: string, key: string): Promise<boolean> {
    // Validate environment ID
    if (!this.isValidUuid(envId)) {
      throw new Error(`Invalid environment ID: ${envId}`)
    }

    // Check if environment exists
    const environmentExists = await this.environmentExists(envId)
    if (!environmentExists) {
      throw new Error(`Environment with ID ${envId} not found`)
    }

    const db = this.dbManager.getDb()

    const result = await db
      .delete(environmentVariables)
      .where(
        and(eq(environmentVariables.environmentId, envId), eq(environmentVariables.key, key.trim()))
      )
      .returning({ id: environmentVariables.id })

    return result.length > 0
  }

  /**
   * Set multiple environment variables at once
   *
   * @param envId - Environment ID
   * @param variables - Record of key-value pairs
   * @param options - Additional options for all variables
   * @returns Number of variables set
   * @throws Error if environment not found
   */
  async setVariables(
    envId: string,
    variables: Record<string, string>,
    options: SetVariableOptions = {}
  ): Promise<number> {
    // Validate environment ID
    if (!this.isValidUuid(envId)) {
      throw new Error(`Invalid environment ID: ${envId}`)
    }

    // Check if environment exists
    const environmentExists = await this.environmentExists(envId)
    if (!environmentExists) {
      throw new Error(`Environment with ID ${envId} not found`)
    }

    // Process variables in batches to avoid transaction timeouts
    const entries = Object.entries(variables)
    const batchSize = 50
    let processedCount = 0

    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize)

      await this.dbManager.transaction(async tx => {
        for (const [key, value] of batch) {
          if (!key || key.trim() === '') {
            continue // Skip empty keys
          }

          const normalizedKey = key.trim()

          // Determine if value should be encrypted
          const isSensitive =
            options.sensitive !== undefined
              ? options.sensitive
              : this.cryptoService.isSensitiveValue(normalizedKey)

          // Encrypt value if sensitive
          let processedValue = value
          let encrypted = false

          if (isSensitive) {
            processedValue = await this.cryptoService.encrypt(value)
            encrypted = true
          }

          // Check if variable already exists
          const existingVar = await tx.db
            .select()
            .from(environmentVariables)
            .where(
              and(
                eq(environmentVariables.environmentId, envId),
                eq(environmentVariables.key, normalizedKey)
              )
            )

          if (existingVar.length > 0) {
            // Update existing variable
            await tx.db
              .update(environmentVariables)
              .set({
                value: processedValue,
                encrypted,
                sensitive: isSensitive,
                description: options.description || null,
                updatedAt: new Date(),
              })
              .where(eq(environmentVariables.id, existingVar[0].id))
          } else {
            // Create new variable
            const newVariable: NewEnvironmentVariable = {
              environmentId: envId,
              key: normalizedKey,
              value: processedValue,
              encrypted,
              sensitive: isSensitive,
              description: options.description || null,
            }

            await tx.db.insert(environmentVariables).values(newVariable)
          }

          processedCount++
        }
      })
    }

    return processedCount
  }

  /**
   * Export environment variables to a specified format
   *
   * @param envId - Environment ID
   * @param format - Export format (json, dotenv, yaml)
   * @returns Formatted string of environment variables
   * @throws Error if environment not found
   */
  async exportVariables(envId: string, format: ExportFormat = 'json'): Promise<string> {
    // Get all variables with decrypted values
    const variables = await this.listVariables(envId)

    // Convert to key-value object
    const variablesObj = variables.reduce<Record<string, string>>((acc, variable) => {
      acc[variable.key] = variable.value
      return acc
    }, {})

    // Format according to requested format
    switch (format) {
      case 'json':
        return JSON.stringify(variablesObj, null, 2)

      case 'dotenv':
        return Object.entries(variablesObj)
          .map(([key, value]) => {
            // Escape special characters in value
            const escapedValue = value
              .replace(/\n/g, '\\n')
              .replace(/\r/g, '\\r')
              .replace(/"/g, '\\"')

            // Wrap value in quotes if it contains spaces or special characters
            const needsQuotes = /[\s#;,]/.test(value)
            const formattedValue = needsQuotes ? `"${escapedValue}"` : escapedValue

            return `${key}=${formattedValue}`
          })
          .join('\n')

      case 'yaml':
        return Object.entries(variablesObj)
          .map(([key, value]) => {
            // Escape special characters in YAML
            const needsQuotes = /[:#{}[\],&*?|<>=!%@`]/.test(value) || value === ''
            const formattedValue = needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value

            return `${key}: ${formattedValue}`
          })
          .join('\n')

      default:
        throw new Error(`Unsupported export format: ${format}`)
    }
  }

  /**
   * Import environment variables from a formatted string
   *
   * @param envId - Environment ID
   * @param data - Formatted string of environment variables
   * @param format - Import format (json, dotenv, yaml)
   * @returns Import result with counts and errors
   * @throws Error if environment not found or format is invalid
   */
  async importVariables(envId: string, data: string, format: ImportFormat): Promise<ImportResult> {
    // Validate environment ID
    if (!this.isValidUuid(envId)) {
      throw new Error(`Invalid environment ID: ${envId}`)
    }

    // Check if environment exists
    const environmentExists = await this.environmentExists(envId)
    if (!environmentExists) {
      throw new Error(`Environment with ID ${envId} not found`)
    }

    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      errors: [],
    }

    let variables: Record<string, string> = {}

    try {
      // Parse according to format
      switch (format) {
        case 'json':
          try {
            variables = JSON.parse(data)
            if (typeof variables !== 'object' || variables === null) {
              throw new Error('JSON must contain an object with key-value pairs')
            }
          } catch (error) {
            throw new Error(
              `Invalid JSON format: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
          }
          break

        case 'dotenv':
          variables = this.parseDotEnv(data)
          break

        case 'yaml':
          variables = this.parseYaml(data)
          break

        default:
          throw new Error(`Unsupported import format: ${format}`)
      }

      // Process each variable
      for (const [key, value] of Object.entries(variables)) {
        if (!key || key.trim() === '') {
          result.skipped++
          continue
        }

        try {
          await this.setVariable(envId, key, value)
          result.imported++
        } catch (error) {
          result.errors.push({
            key,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      return result
    } catch (error) {
      throw new Error(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Copy all environment variables from one environment to another
   *
   * @param sourceEnvId - Source environment ID
   * @param targetEnvId - Target environment ID
   * @param overwrite - Whether to overwrite existing variables in target
   * @returns Number of variables copied
   * @throws Error if either environment not found
   */
  async copyVariables(
    sourceEnvId: string,
    targetEnvId: string,
    overwrite: boolean = false
  ): Promise<number> {
    // Validate environment IDs
    if (!this.isValidUuid(sourceEnvId) || !this.isValidUuid(targetEnvId)) {
      throw new Error('Invalid environment ID')
    }

    // Check if environments exist
    const sourceExists = await this.environmentExists(sourceEnvId)
    if (!sourceExists) {
      throw new Error(`Source environment with ID ${sourceEnvId} not found`)
    }

    const targetExists = await this.environmentExists(targetEnvId)
    if (!targetExists) {
      throw new Error(`Target environment with ID ${targetEnvId} not found`)
    }

    // Get all variables from source environment
    const sourceVariables = await this.listVariables(sourceEnvId)

    if (sourceVariables.length === 0) {
      return 0 // No variables to copy
    }

    // Get existing variables in target environment if not overwriting
    let existingKeys: Set<string> = new Set()
    if (!overwrite) {
      const targetVariables = await this.listVariables(targetEnvId)
      existingKeys = new Set(targetVariables.map(v => v.key))
    }

    // Copy variables in batches
    const batchSize = 50
    let copiedCount = 0

    for (let i = 0; i < sourceVariables.length; i += batchSize) {
      const batch = sourceVariables.slice(i, i + batchSize)

      await this.dbManager.transaction(async tx => {
        for (const variable of batch) {
          // Skip if variable exists in target and overwrite is false
          if (!overwrite && existingKeys.has(variable.key)) {
            continue
          }

          // Prepare variable data
          const newVariable: NewEnvironmentVariable = {
            environmentId: targetEnvId,
            key: variable.key,
            value: variable.value,
            encrypted: variable.encrypted,
            sensitive: variable.sensitive,
            description: variable.description,
          }

          // Re-encrypt if necessary (value was decrypted during listVariables)
          if (variable.sensitive) {
            newVariable.value = await this.cryptoService.encrypt(variable.value)
            newVariable.encrypted = true
          }

          // Check if variable already exists in target
          const existingVar = await tx.db
            .select()
            .from(environmentVariables)
            .where(
              and(
                eq(environmentVariables.environmentId, targetEnvId),
                eq(environmentVariables.key, variable.key)
              )
            )

          if (existingVar.length > 0 && overwrite) {
            // Update existing variable
            await tx.db
              .update(environmentVariables)
              .set({
                value: newVariable.value,
                encrypted: newVariable.encrypted,
                sensitive: newVariable.sensitive,
                description: newVariable.description,
                updatedAt: new Date(),
              })
              .where(eq(environmentVariables.id, existingVar[0].id))
          } else if (existingVar.length === 0) {
            // Create new variable
            await tx.db.insert(environmentVariables).values(newVariable)
          } else {
            // Skip (existing and !overwrite)
            continue
          }

          copiedCount++
        }
      })
    }

    return copiedCount
  }

  /**
   * Search for environment variables by key pattern
   *
   * @param envId - Environment ID
   * @param pattern - Search pattern
   * @returns Array of matching environment variables
   * @throws Error if environment not found
   */
  async searchVariables(envId: string, pattern: string): Promise<EnvironmentVariable[]> {
    return this.listVariables(envId, pattern)
  }

  /**
   * Get variables by prefix
   *
   * @param envId - Environment ID
   * @param prefix - Key prefix
   * @returns Array of matching environment variables
   * @throws Error if environment not found
   */
  async getVariablesByPrefix(envId: string, prefix: string): Promise<EnvironmentVariable[]> {
    // Validate environment ID
    if (!this.isValidUuid(envId)) {
      throw new Error(`Invalid environment ID: ${envId}`)
    }

    // Check if environment exists
    const environmentExists = await this.environmentExists(envId)
    if (!environmentExists) {
      throw new Error(`Environment with ID ${envId} not found`)
    }

    const db = this.dbManager.getDb()

    const variables = await db
      .select()
      .from(environmentVariables)
      .where(
        and(
          eq(environmentVariables.environmentId, envId),
          sql`${environmentVariables.key} LIKE ${prefix + '%'}`
        )
      )
      .orderBy(environmentVariables.key)

    // Decrypt encrypted values
    return Promise.all(
      variables.map(async variable => {
        if (variable.encrypted) {
          try {
            const decryptedValue = await this.cryptoService.decrypt(variable.value)
            return {
              ...variable,
              value: decryptedValue,
            }
          } catch (error) {
            console.error(`Failed to decrypt variable ${variable.key}:`, error)
            // Return with placeholder for failed decryption
            return {
              ...variable,
              value: '[DECRYPTION_FAILED]',
            }
          }
        }
        return variable
      })
    )
  }

  /**
   * Delete variables by prefix
   *
   * @param envId - Environment ID
   * @param prefix - Key prefix
   * @returns Number of variables deleted
   * @throws Error if environment not found
   */
  async deleteVariablesByPrefix(envId: string, prefix: string): Promise<number> {
    // Validate environment ID
    if (!this.isValidUuid(envId)) {
      throw new Error(`Invalid environment ID: ${envId}`)
    }

    // Check if environment exists
    const environmentExists = await this.environmentExists(envId)
    if (!environmentExists) {
      throw new Error(`Environment with ID ${envId} not found`)
    }

    const db = this.dbManager.getDb()

    const result = await db
      .delete(environmentVariables)
      .where(
        and(
          eq(environmentVariables.environmentId, envId),
          sql`${environmentVariables.key} LIKE ${prefix + '%'}`
        )
      )
      .returning({ id: environmentVariables.id })

    return result.length
  }

  /**
   * Check if an environment exists
   *
   * @param envId - Environment ID
   * @returns True if environment exists, false otherwise
   */
  private async environmentExists(envId: string): Promise<boolean> {
    const db = this.dbManager.getDb()

    const result = await db
      .select({ id: environments.id })
      .from(environments)
      .where(eq(environments.id, envId))

    return result.length > 0
  }

  /**
   * Validate if a string is a valid UUID
   *
   * @param id - String to validate
   * @returns True if valid UUID, false otherwise
   */
  private isValidUuid(id: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    return uuidRegex.test(id)
  }

  /**
   * Parse a dotenv format string into key-value pairs
   *
   * @param data - Dotenv format string
   * @returns Record of key-value pairs
   */
  private parseDotEnv(data: string): Record<string, string> {
    const result: Record<string, string> = {}

    // Split by lines and process each line
    const lines = data.split(/\r?\n/)

    for (const line of lines) {
      // Skip empty lines and comments
      const trimmedLine = line.trim()
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue
      }

      // Find the first equals sign (not escaped)
      let equalsIndex = -1
      let inQuote = false
      let escapeNext = false

      for (let i = 0; i < trimmedLine.length; i++) {
        const char = trimmedLine[i]

        if (escapeNext) {
          escapeNext = false
          continue
        }

        if (char === '\\') {
          escapeNext = true
          continue
        }

        if (char === '"' || char === "'") {
          inQuote = !inQuote
          continue
        }

        if (char === '=' && !inQuote) {
          equalsIndex = i
          break
        }
      }

      if (equalsIndex === -1) {
        continue // No equals sign found
      }

      // Extract key and value
      const key = trimmedLine.substring(0, equalsIndex).trim()
      let value = trimmedLine.substring(equalsIndex + 1).trim()

      // Remove quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.substring(1, value.length - 1)
      }

      // Unescape characters
      value = value
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")

      result[key] = value
    }

    return result
  }

  /**
   * Parse a YAML format string into key-value pairs
   *
   * @param data - YAML format string
   * @returns Record of key-value pairs
   */
  private parseYaml(data: string): Record<string, string> {
    const result: Record<string, string> = {}

    // Split by lines and process each line
    const lines = data.split(/\r?\n/)

    for (const line of lines) {
      // Skip empty lines and comments
      const trimmedLine = line.trim()
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue
      }

      // Find the first colon (not in a quoted string)
      let colonIndex = -1
      let inQuote = false
      let escapeNext = false

      for (let i = 0; i < trimmedLine.length; i++) {
        const char = trimmedLine[i]

        if (escapeNext) {
          escapeNext = false
          continue
        }

        if (char === '\\') {
          escapeNext = true
          continue
        }

        if (char === '"' || char === "'") {
          inQuote = !inQuote
          continue
        }

        if (char === ':' && !inQuote) {
          colonIndex = i
          break
        }
      }

      if (colonIndex === -1) {
        continue // No colon found
      }

      // Extract key and value
      const key = trimmedLine.substring(0, colonIndex).trim()
      let value = trimmedLine.substring(colonIndex + 1).trim()

      // Remove quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.substring(1, value.length - 1)
      }

      result[key] = value
    }

    return result
  }
}
