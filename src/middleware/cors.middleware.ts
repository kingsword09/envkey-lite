// CORS middleware
// Will be implemented in task 4.1

import type { MiddlewareHandler } from 'hono'

// Placeholder export to avoid TypeScript errors during infrastructure setup
export const corsMiddleware: MiddlewareHandler = async (_c, next) => {
  // Placeholder implementation
  await next()
}
