// Authentication and authorization types

export interface AuthResult {
  success: boolean
  user?: {
    id: string
    email: string
    name: string
    role: string
  }
  token?: string
  error?: string
}

export interface ApiKey {
  id: string
  userId: string
  name: string
  key: string
  lastUsedAt?: Date
  createdAt: Date
}

/**
 * JWT payload interface
 */
export interface JWTPayload {
  userId: string
  email: string
  role: string
  iat?: number
  exp?: number
}

/**
 * Authentication context interface
 */
export interface AuthContext {
  user: {
    id: string
    email: string
    name: string
    role: string
    passwordHash: string
    createdAt: Date
    updatedAt: Date
  }
  authMethod: 'jwt' | 'api_key'
}

/**
 * Permission levels for authorization
 */
export type Permission = 'read' | 'write' | 'admin' | 'owner'

/**
 * Resource types for permission checking
 */
export type ResourceType = 'project' | 'environment' | 'variable' | 'user' | 'system'

/**
 * Login request interface
 */
export interface LoginRequest {
  email: string
  password: string
}

/**
 * Login response interface
 */
export interface LoginResponse {
  success: boolean
  token?: string
  user?: {
    id: string
    email: string
    name: string
    role: string
  }
  error?: string
}

/**
 * API Key creation request
 */
export interface CreateApiKeyRequest {
  name: string
}

/**
 * API Key creation response
 */
export interface CreateApiKeyResponse {
  success: boolean
  apiKey?: {
    id: string
    name: string
    key: string
    createdAt: Date
  }
  error?: string
}
