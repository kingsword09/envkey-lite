// Application constants

// User roles
export const USER_ROLES = {
  ADMIN: 'admin',
  USER: 'user',
} as const

// Project roles
export const PROJECT_ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  EDITOR: 'editor',
  VIEWER: 'viewer',
} as const

// Audit actions
export const AUDIT_ACTIONS = {
  // User actions
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',

  // Project actions
  PROJECT_CREATED: 'project.created',
  PROJECT_UPDATED: 'project.updated',
  PROJECT_DELETED: 'project.deleted',

  // Environment actions
  ENVIRONMENT_CREATED: 'environment.created',
  ENVIRONMENT_UPDATED: 'environment.updated',
  ENVIRONMENT_DELETED: 'environment.deleted',

  // Variable actions
  VARIABLE_CREATED: 'variable.created',
  VARIABLE_UPDATED: 'variable.updated',
  VARIABLE_DELETED: 'variable.deleted',
  VARIABLE_ACCESSED: 'variable.accessed',

  // API Key actions
  API_KEY_CREATED: 'api_key.created',
  API_KEY_USED: 'api_key.used',
  API_KEY_DELETED: 'api_key.deleted',
} as const

// Error codes
export const ERROR_CODES = {
  // Authentication errors (1000-1099)
  UNAUTHORIZED: 'AUTH_001',
  INVALID_TOKEN: 'AUTH_002',
  TOKEN_EXPIRED: 'AUTH_003',
  INVALID_API_KEY: 'AUTH_004',

  // Authorization errors (1100-1199)
  FORBIDDEN: 'AUTHZ_001',
  INSUFFICIENT_PERMISSIONS: 'AUTHZ_002',

  // Validation errors (1200-1299)
  VALIDATION_ERROR: 'VALID_001',
  INVALID_INPUT: 'VALID_002',
  MISSING_REQUIRED_FIELD: 'VALID_003',

  // Resource errors (1300-1399)
  RESOURCE_NOT_FOUND: 'RES_001',
  RESOURCE_ALREADY_EXISTS: 'RES_002',
  RESOURCE_CONFLICT: 'RES_003',

  // System errors (1400-1499)
  INTERNAL_ERROR: 'SYS_001',
  DATABASE_ERROR: 'SYS_002',
  FILESYSTEM_ERROR: 'SYS_003',

  // Rate limiting (1500-1599)
  RATE_LIMIT_EXCEEDED: 'RATE_001',
} as const

// Default environment names
export const DEFAULT_ENVIRONMENTS = ['development', 'staging', 'production'] as const

// Sensitive variable keywords (for auto-detection)
export const SENSITIVE_KEYWORDS = [
  'password',
  'secret',
  'key',
  'token',
  'auth',
  'api_key',
  'private',
  'credential',
  'cert',
  'certificate',
] as const
