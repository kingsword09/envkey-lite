import { z } from 'zod'

// Environment configuration schema
const configSchema = z.object({
  // Server configuration
  PORT: z.string().default('3000').transform(Number),
  HOST: z.string().default('localhost'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database configuration
  DATABASE_PATH: z.string().optional(), // undefined for in-memory mode

  // Security configuration
  JWT_SECRET: z.string().min(32),
  API_KEY_PREFIX: z.string().default('ek_'),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.string().default('900000').transform(Number), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100').transform(Number),

  // Audit log retention
  AUDIT_LOG_RETENTION_DAYS: z.string().default('90').transform(Number),
})

export type Config = z.infer<typeof configSchema>

// Load and validate configuration
export function loadConfig(): Config {
  try {
    return configSchema.parse(process.env)
  } catch (error) {
    console.error('Configuration validation failed:', error)
    process.exit(1)
  }
}

// Export singleton config instance
export const config = loadConfig()
