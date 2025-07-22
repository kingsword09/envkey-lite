// CORS middleware
import type { MiddlewareHandler } from 'hono'

export interface CorsOptions {
  origin?: string | string[] | ((origin: string) => boolean)
  methods?: string[]
  allowedHeaders?: string[]
  credentials?: boolean
  maxAge?: number
}

export const corsMiddleware = (options: CorsOptions = {}): MiddlewareHandler => {
  const {
    origin = '*',
    methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders = ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials = true,
    maxAge = 86400, // 24 hours
  } = options

  return async (c, next) => {
    const requestOrigin = c.req.header('Origin')
    
    // Handle origin
    if (origin === '*') {
      c.header('Access-Control-Allow-Origin', '*')
    } else if (typeof origin === 'string') {
      c.header('Access-Control-Allow-Origin', origin)
    } else if (Array.isArray(origin)) {
      if (requestOrigin && origin.includes(requestOrigin)) {
        c.header('Access-Control-Allow-Origin', requestOrigin)
      }
    } else if (typeof origin === 'function') {
      if (requestOrigin && origin(requestOrigin)) {
        c.header('Access-Control-Allow-Origin', requestOrigin)
      }
    }

    // Set other CORS headers
    c.header('Access-Control-Allow-Methods', methods.join(', '))
    c.header('Access-Control-Allow-Headers', allowedHeaders.join(', '))
    
    if (credentials) {
      c.header('Access-Control-Allow-Credentials', 'true')
    }
    
    c.header('Access-Control-Max-Age', maxAge.toString())

    // Handle preflight requests
    if (c.req.method === 'OPTIONS') {
      c.status(204)
      return c.body(null)
    }

    await next()
  }
}
