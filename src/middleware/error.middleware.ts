// Error handling middleware
import type { MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'

// Error codes as defined in the design document
export enum ErrorCode {
  // Authentication errors (1000-1099)
  UNAUTHORIZED = 'AUTH_001',
  INVALID_TOKEN = 'AUTH_002',
  TOKEN_EXPIRED = 'AUTH_003',
  INVALID_API_KEY = 'AUTH_004',
  
  // Authorization errors (1100-1199)
  FORBIDDEN = 'AUTHZ_001',
  INSUFFICIENT_PERMISSIONS = 'AUTHZ_002',
  
  // Validation errors (1200-1299)
  VALIDATION_ERROR = 'VALID_001',
  INVALID_INPUT = 'VALID_002',
  MISSING_REQUIRED_FIELD = 'VALID_003',
  
  // Resource errors (1300-1399)
  RESOURCE_NOT_FOUND = 'RES_001',
  RESOURCE_ALREADY_EXISTS = 'RES_002',
  RESOURCE_CONFLICT = 'RES_003',
  
  // System errors (1400-1499)
  INTERNAL_ERROR = 'SYS_001',
  DATABASE_ERROR = 'SYS_002',
  FILESYSTEM_ERROR = 'SYS_003',
  
  // Rate limit (1500-1599)
  RATE_LIMIT_EXCEEDED = 'RATE_001'
}

export interface ErrorResponse {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
    timestamp: string
    requestId: string
  }
}

// Custom error classes
export class ValidationError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class AuthenticationError extends Error {
  constructor(
    public code: ErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'AuthenticationError'
  }
}

export class AuthorizationError extends Error {
  constructor(
    public code: ErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'AuthorizationError'
  }
}

export class ResourceError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ResourceError'
  }
}

export class SystemError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'SystemError'
  }
}

function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

export const errorHandler = (error: unknown, c: unknown): Response => {
  const requestId = (c as { get?: (key: string) => string }).get?.('requestId') || generateRequestId()
  
  // Handle HTTPException from Hono
  if (error instanceof HTTPException) {
    return (c as { json: (obj: unknown, status?: number) => Response }).json({
      error: {
        code: `HTTP_${error.status}`,
        message: error.message,
        timestamp: new Date().toISOString(),
        requestId
      }
    }, error.status)
  }
  
  // Handle custom validation errors
  if (error instanceof ValidationError) {
    return (c as { json: (obj: unknown, status?: number) => Response }).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        timestamp: new Date().toISOString(),
        requestId
      }
    }, 400)
  }
  
  // Handle authentication errors
  if (error instanceof AuthenticationError) {
    return (c as { json: (obj: unknown, status?: number) => Response }).json({
      error: {
        code: error.code,
        message: error.message,
        timestamp: new Date().toISOString(),
        requestId
      }
    }, 401)
  }
  
  // Handle authorization errors
  if (error instanceof AuthorizationError) {
    return (c as { json: (obj: unknown, status?: number) => Response }).json({
      error: {
        code: error.code,
        message: error.message,
        timestamp: new Date().toISOString(),
        requestId
      }
    }, 403)
  }
  
  // Handle resource errors
  if (error instanceof ResourceError) {
    const status = error.code === ErrorCode.RESOURCE_NOT_FOUND ? 404 : 
                  error.code === ErrorCode.RESOURCE_ALREADY_EXISTS ? 409 : 400
    
    return (c as { json: (obj: unknown, status?: number) => Response }).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        timestamp: new Date().toISOString(),
        requestId
      }
    }, status)
  }
  
  // Handle system errors
  if (error instanceof SystemError) {
    return (c as { json: (obj: unknown, status?: number) => Response }).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        timestamp: new Date().toISOString(),
        requestId
      }
    }, 500)
  }
  
  // Handle unknown errors
  return (c as { json: (obj: unknown, status?: number) => Response }).json({
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
      timestamp: new Date().toISOString(),
      requestId
    }
  }, 500)
}

// Keep the middleware for backward compatibility, but it's mainly for request ID setting
export const errorMiddleware: MiddlewareHandler = async (c, next) => {
  await next()
}
