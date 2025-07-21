// Authentication middleware
// Will be implemented in task 4.2

import type { MiddlewareHandler } from 'hono'

// Placeholder export to avoid TypeScript errors during infrastructure setup
export const authMiddleware: MiddlewareHandler = async (_c, next) => {
  // Placeholder implementation
  await next()
}
