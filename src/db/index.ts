// Database configuration and connection management
export * from './schema'
export * from './manager'

// Re-export commonly used types
export type { DatabaseConfig, QueryResult, Transaction } from './manager'
