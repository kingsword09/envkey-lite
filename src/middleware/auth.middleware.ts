import type { MiddlewareHandler, Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import jwt from 'jsonwebtoken'
import { UserService } from '../services/user.service'
import { User } from '../db/schema'

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
  user: User
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
 * Configuration for authentication middleware
 */
export interface AuthConfig {
  jwtSecret: string
  userService: UserService
  skipPaths?: string[]
}

/**
 * Create JWT authentication middleware
 * 
 * @param config - Authentication configuration
 * @returns Hono middleware handler
 */
export function createJWTAuthMiddleware(config: AuthConfig): MiddlewareHandler {
  return async (c: Context, next) => {
    // Skip authentication for certain paths
    if (config.skipPaths?.some(path => c.req.path.startsWith(path))) {
      await next()
      return
    }

    try {
      // Get the Authorization header
      const authHeader = c.req.header('Authorization')
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new HTTPException(401, { 
          message: 'Missing or invalid Authorization header' 
        })
      }

      // Extract the token
      const token = authHeader.substring(7) // Remove 'Bearer ' prefix

      // Verify the JWT token
      const decoded = jwt.verify(token, config.jwtSecret) as JWTPayload
      
      // Get the user from the database
      const user = await config.userService.getUserById(decoded.userId)
      
      if (!user) {
        throw new HTTPException(401, { 
          message: 'User not found' 
        })
      }

      // Set the authentication context
      c.set('auth', {
        user,
        authMethod: 'jwt'
      } as AuthContext)

      await next()
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new HTTPException(401, { 
          message: 'Invalid JWT token' 
        })
      }
      
      if (error instanceof jwt.TokenExpiredError) {
        throw new HTTPException(401, { 
          message: 'JWT token expired' 
        })
      }

      // Re-throw HTTPExceptions
      if (error instanceof HTTPException) {
        throw error
      }

      // Handle other errors
      throw new HTTPException(401, { 
        message: 'Authentication failed' 
      })
    }
  }
}

/**
 * Create API Key authentication middleware
 * 
 * @param config - Authentication configuration
 * @returns Hono middleware handler
 */
export function createAPIKeyAuthMiddleware(config: AuthConfig): MiddlewareHandler {
  return async (c: Context, next) => {
    // Skip authentication for certain paths
    if (config.skipPaths?.some(path => c.req.path.startsWith(path))) {
      await next()
      return
    }

    try {
      // Get the API key from header or query parameter
      let apiKey = c.req.header('X-API-Key') || c.req.header('Authorization')
      
      // If Authorization header is used, it should be in format "Bearer <api_key>"
      if (apiKey?.startsWith('Bearer ')) {
        apiKey = apiKey.substring(7)
      }
      
      // Also check query parameter as fallback
      if (!apiKey) {
        apiKey = c.req.query('api_key')
      }

      if (!apiKey) {
        throw new HTTPException(401, { 
          message: 'Missing API key' 
        })
      }

      // Verify the API key
      const user = await config.userService.verifyApiKey(apiKey)
      
      if (!user) {
        throw new HTTPException(401, { 
          message: 'Invalid API key' 
        })
      }

      // Set the authentication context
      c.set('auth', {
        user,
        authMethod: 'api_key'
      } as AuthContext)

      await next()
    } catch (error) {
      // Re-throw HTTPExceptions
      if (error instanceof HTTPException) {
        throw error
      }

      // Handle other errors
      throw new HTTPException(401, { 
        message: 'API key authentication failed' 
      })
    }
  }
}

/**
 * Create combined authentication middleware that supports both JWT and API Key
 * 
 * @param config - Authentication configuration
 * @returns Hono middleware handler
 */
export function createAuthMiddleware(config: AuthConfig): MiddlewareHandler {
  return async (c: Context, next) => {
    // Skip authentication for certain paths
    if (config.skipPaths?.some(path => c.req.path.startsWith(path))) {
      await next()
      return
    }

    const authHeader = c.req.header('Authorization')
    const apiKeyHeader = c.req.header('X-API-Key')
    const apiKeyQuery = c.req.query('api_key')

    // Determine authentication method based on headers/query
    if (authHeader?.startsWith('Bearer ') && !apiKeyHeader && !apiKeyQuery) {
      // Likely JWT token
      const jwtMiddleware = createJWTAuthMiddleware(config)
      await jwtMiddleware(c, next)
    } else if (apiKeyHeader || apiKeyQuery || (authHeader?.startsWith('Bearer ') && (apiKeyHeader || apiKeyQuery))) {
      // API Key authentication
      const apiKeyMiddleware = createAPIKeyAuthMiddleware(config)
      await apiKeyMiddleware(c, next)
    } else {
      throw new HTTPException(401, { 
        message: 'Authentication required' 
      })
    }
  }
}

/**
 * Create permission checking middleware
 * 
 * @param requiredPermission - The required permission level
 * @param resourceType - The type of resource being accessed
 * @param getResourceId - Optional function to extract resource ID from context
 * @returns Hono middleware handler
 */
export function createPermissionMiddleware(
  requiredPermission: Permission,
  resourceType: ResourceType,
  getResourceId?: (c: Context) => string | undefined
): MiddlewareHandler {
  return async (c: Context, next) => {
    try {
      // Get the authentication context
      const auth = c.get('auth') as AuthContext | undefined
      
      if (!auth) {
        throw new HTTPException(401, { 
          message: 'Authentication required' 
        })
      }

      const { user } = auth
      const resourceId = getResourceId?.(c)

      // Check permissions based on resource type and required permission
      const hasPermission = await checkUserPermission(
        user,
        requiredPermission,
        resourceType,
        resourceId
      )

      if (!hasPermission) {
        throw new HTTPException(403, { 
          message: 'Insufficient permissions' 
        })
      }

      await next()
    } catch (error) {
      // Re-throw HTTPExceptions
      if (error instanceof HTTPException) {
        throw error
      }

      // Handle other errors
      throw new HTTPException(403, { 
        message: 'Permission check failed' 
      })
    }
  }
}

/**
 * Check if a user has the required permission for a resource
 * 
 * @param user - The user to check permissions for
 * @param requiredPermission - The required permission level
 * @param resourceType - The type of resource
 * @param resourceId - Optional resource ID for resource-specific permissions
 * @returns True if the user has the required permission
 */
async function checkUserPermission(
  user: User,
  requiredPermission: Permission,
  resourceType: ResourceType,
  resourceId?: string
): Promise<boolean> {
  // Admin users have all permissions
  if (user.role === 'admin') {
    return true
  }

  // System-level permissions
  if (resourceType === 'system') {
    return user.role === 'admin'
  }

  // User-level permissions
  if (resourceType === 'user') {
    // Users can read their own data
    if (requiredPermission === 'read' && resourceId === user.id) {
      return true
    }
    // Only admins can write user data or access other users' data
    return user.role === 'admin'
  }

  // For project, environment, and variable resources, we would need to check
  // project permissions from the database. For now, we'll implement basic logic.
  // In a full implementation, this would query the project_permissions table.
  
  // Basic permission logic for non-admin users
  switch (requiredPermission) {
    case 'read':
      return true // All authenticated users can read (this would be refined with project permissions)
    case 'write':
      return user.role === 'admin' // Only admins can write (this would be refined with project permissions)
    case 'admin':
    case 'owner':
      return user.role === 'admin' // Only system admins have admin/owner permissions
    default:
      return false
  }
}

/**
 * Create role-based authorization middleware
 * 
 * @param allowedRoles - Array of roles that are allowed to access the resource
 * @returns Hono middleware handler
 */
export function createRoleMiddleware(allowedRoles: string[]): MiddlewareHandler {
  return async (c: Context, next) => {
    try {
      // Get the authentication context
      const auth = c.get('auth') as AuthContext | undefined
      
      if (!auth) {
        throw new HTTPException(401, { 
          message: 'Authentication required' 
        })
      }

      const { user } = auth

      // Check if user's role is in the allowed roles
      if (!allowedRoles.includes(user.role)) {
        throw new HTTPException(403, { 
          message: `Access denied. Required roles: ${allowedRoles.join(', ')}` 
        })
      }

      await next()
    } catch (error) {
      // Re-throw HTTPExceptions
      if (error instanceof HTTPException) {
        throw error
      }

      // Handle other errors
      throw new HTTPException(403, { 
        message: 'Role authorization failed' 
      })
    }
  }
}

/**
 * Utility function to generate JWT token
 * 
 * @param user - The user to generate token for
 * @param secret - JWT secret
 * @param expiresIn - Token expiration time (default: '24h')
 * @returns JWT token
 */
export function generateJWTToken(
  user: User, 
  secret: string, 
  expiresIn: string = '24h'
): string {
  const payload: JWTPayload = {
    userId: user.id,
    email: user.email,
    role: user.role
  }

  return jwt.sign(payload, secret, { expiresIn })
}

/**
 * Utility function to verify JWT token
 * 
 * @param token - JWT token to verify
 * @param secret - JWT secret
 * @returns Decoded JWT payload
 */
export function verifyJWTToken(token: string, secret: string): JWTPayload {
  return jwt.verify(token, secret) as JWTPayload
}

/**
 * Get the current authenticated user from context
 * 
 * @param c - Hono context
 * @returns The authenticated user or null if not authenticated
 */
export function getCurrentUser(c: Context): User | null {
  const auth = c.get('auth') as AuthContext | undefined
  return auth?.user || null
}

/**
 * Get the authentication method used
 * 
 * @param c - Hono context
 * @returns The authentication method or null if not authenticated
 */
export function getAuthMethod(c: Context): 'jwt' | 'api_key' | null {
  const auth = c.get('auth') as AuthContext | undefined
  return auth?.authMethod || null
}

/**
 * Check if the current user is an admin
 * 
 * @param c - Hono context
 * @returns True if the current user is an admin
 */
export function isAdmin(c: Context): boolean {
  const user = getCurrentUser(c)
  return user?.role === 'admin'
}

/**
 * Check if the current user is the owner of a resource
 * 
 * @param c - Hono context
 * @param resourceOwnerId - The ID of the resource owner
 * @returns True if the current user is the owner
 */
export function isOwner(c: Context, resourceOwnerId: string): boolean {
  const user = getCurrentUser(c)
  return user?.id === resourceOwnerId
}

// Export the main middleware for backward compatibility
export const authMiddleware = createAuthMiddleware
