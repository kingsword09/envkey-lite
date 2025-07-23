import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { validator } from 'hono/validator'
import { UserService } from '../services/user.service'
import { CryptoService } from '../services/crypto.service'
import { DatabaseManager } from '../db/manager'
import { 
  generateJWTToken, 
  createAuthMiddleware, 
  getCurrentUser
} from '../middleware/auth.middleware'
import { 
  LoginRequest, 
  LoginResponse, 
  CreateApiKeyRequest, 
  CreateApiKeyResponse 
} from '../types/auth'
import { CreateUserData, UpdateUserData } from '../types/user'
import { errorHandler } from '../middleware/error.middleware'

/**
 * Authentication routes for user management
 * Handles user registration, login, API key management, and user profile operations
 */
export function createAuthRoutes(
  dbManager: DatabaseManager,
  cryptoService: CryptoService,
  jwtSecret: string
): Hono {
  const app = new Hono()
  const userService = new UserService(dbManager, cryptoService)
  
  // Set up error handler
  app.onError(errorHandler)
  
  // Create auth middleware
  const authMiddleware = createAuthMiddleware({
    jwtSecret,
    userService,
    skipPaths: ['/auth/login', '/auth/register']
  })

  // User registration endpoint
  app.post('/register', 
    validator('json', (value, _c) => {
      const { email, name, password, role } = value as Record<string, unknown>
      
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        throw new HTTPException(400, { message: 'Invalid email address' })
      }
      
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw new HTTPException(400, { message: 'Name is required' })
      }
      
      if (!password || typeof password !== 'string' || password.length < 8) {
        throw new HTTPException(400, { message: 'Password must be at least 8 characters long' })
      }
      
      if (role && !['admin', 'user'].includes(role)) {
        throw new HTTPException(400, { message: 'Invalid role' })
      }
      
      return {
        email: email.toLowerCase().trim(),
        name: name.trim(),
        password,
        role: role || 'user'
      } as CreateUserData
    }),
    async (c) => {
      try {
        const userData = c.req.valid('json')
        
        // Check if user already exists
        const existingUser = await userService.getUserByEmail(userData.email)
        if (existingUser) {
          throw new HTTPException(409, { message: 'User with this email already exists' })
        }
        
        // Validate password strength
        const passwordValidation = userService.validatePasswordStrength(userData.password)
        if (!passwordValidation.isStrong) {
          throw new HTTPException(400, { 
            message: `Password is too weak: ${passwordValidation.feedback.join(', ')}`
          })
        }
        
        // Create the user
        const user = await userService.createUser(userData)
        
        // Generate JWT token
        const token = generateJWTToken(user, jwtSecret)
        
        return c.json({
          success: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role
          },
          token
        }, 201)
        
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }
        
        console.error('Registration error:', error)
        throw new HTTPException(500, { 
          message: 'Registration failed',
          cause: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  )

  // User login endpoint
  app.post('/login',
    validator('json', (value, _c) => {
      const { email, password } = value as Record<string, unknown>
      
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        throw new HTTPException(400, { message: 'Invalid email address' })
      }
      
      if (!password || typeof password !== 'string') {
        throw new HTTPException(400, { message: 'Password is required' })
      }
      
      return {
        email: email.toLowerCase().trim(),
        password
      } as LoginRequest
    }),
    async (c) => {
      try {
        const { email, password } = c.req.valid('json')
        
        // Authenticate user
        const user = await userService.authenticateUser(email, password)
        if (!user) {
          throw new HTTPException(401, { message: 'Invalid email or password' })
        }
        
        // Generate JWT token
        const token = generateJWTToken(user, jwtSecret)
        
        const response: LoginResponse = {
          success: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role
          },
          token
        }
        
        return c.json(response)
        
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }
        
        console.error('Login error:', error)
        throw new HTTPException(500, { 
          message: 'Login failed',
          cause: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  )

  // Get current user profile
  app.get('/me', authMiddleware, async (c) => {
    try {
      const user = getCurrentUser(c)
      if (!user) {
        throw new HTTPException(401, { message: 'Authentication required' })
      }
      
      return c.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      })
      
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      
      console.error('Get profile error:', error)
      throw new HTTPException(500, { 
        message: 'Failed to get user profile',
        cause: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  // Update user profile
  app.put('/me',
    authMiddleware,
    validator('json', (value, _c) => {
      const { name, email } = value as Record<string, unknown>
      
      const updateData: UpdateUserData = {}
      
      if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length === 0) {
          throw new HTTPException(400, { message: 'Name cannot be empty' })
        }
        updateData.name = name.trim()
      }
      
      if (email !== undefined) {
        if (typeof email !== 'string' || !email.includes('@')) {
          throw new HTTPException(400, { message: 'Invalid email address' })
        }
        updateData.email = email.toLowerCase().trim()
      }
      
      return updateData
    }),
    async (c) => {
      try {
        const user = getCurrentUser(c)
        if (!user) {
          throw new HTTPException(401, { message: 'Authentication required' })
        }
        
        const updateData = c.req.valid('json')
        
        // Check if email is being changed and if it already exists
        if (updateData.email && updateData.email !== user.email) {
          const existingUser = await userService.getUserByEmail(updateData.email)
          if (existingUser) {
            throw new HTTPException(409, { message: 'Email already in use' })
          }
        }
        
        // Update the user
        const updatedUser = await userService.updateUser(user.id, updateData)
        if (!updatedUser) {
          throw new HTTPException(404, { message: 'User not found' })
        }
        
        return c.json({
          success: true,
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            name: updatedUser.name,
            role: updatedUser.role,
            createdAt: updatedUser.createdAt,
            updatedAt: updatedUser.updatedAt
          }
        })
        
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }
        
        console.error('Update profile error:', error)
        throw new HTTPException(500, { 
          message: 'Failed to update user profile',
          cause: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  )

  // Change password
  app.post('/change-password',
    authMiddleware,
    validator('json', (value, _c) => {
      const { currentPassword, newPassword } = value as Record<string, unknown>
      
      if (!currentPassword || typeof currentPassword !== 'string') {
        throw new HTTPException(400, { message: 'Current password is required' })
      }
      
      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
        throw new HTTPException(400, { message: 'New password must be at least 8 characters long' })
      }
      
      return { currentPassword, newPassword }
    }),
    async (c) => {
      try {
        const user = getCurrentUser(c)
        if (!user) {
          throw new HTTPException(401, { message: 'Authentication required' })
        }
        
        const { currentPassword, newPassword } = c.req.valid('json')
        
        // First verify the current password
        const currentUser = await userService.getUserById(user.id)
        if (!currentUser) {
          throw new HTTPException(404, { message: 'User not found' })
        }
        
        const isCurrentPasswordValid = await cryptoService.verify(currentPassword, currentUser.passwordHash)
        if (!isCurrentPasswordValid) {
          throw new HTTPException(400, { message: 'Current password is incorrect' })
        }
        
        // Validate new password strength
        const passwordValidation = userService.validatePasswordStrength(newPassword)
        if (!passwordValidation.isStrong) {
          throw new HTTPException(400, { 
            message: `New password is too weak: ${passwordValidation.feedback.join(', ')}`
          })
        }
        
        // Change the password
        const success = await userService.changePassword(user.id, currentPassword, newPassword)
        if (!success) {
          throw new HTTPException(500, { message: 'Failed to change password' })
        }
        
        return c.json({
          success: true,
          message: 'Password changed successfully'
        })
        
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }
        
        console.error('Change password error:', error)
        throw new HTTPException(500, { 
          message: 'Failed to change password',
          cause: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  )

  // Create API key
  app.post('/api-keys',
    authMiddleware,
    validator('json', (value, _c) => {
      const { name } = value as Record<string, unknown>
      
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw new HTTPException(400, { message: 'API key name is required' })
      }
      
      return { name: name.trim() } as CreateApiKeyRequest
    }),
    async (c) => {
      try {
        const user = getCurrentUser(c)
        if (!user) {
          throw new HTTPException(401, { message: 'Authentication required' })
        }
        
        const { name } = c.req.valid('json')
        
        // Create the API key
        const apiKeyResult = await userService.createApiKey(user.id, name)
        if (!apiKeyResult) {
          throw new HTTPException(500, { message: 'Failed to create API key' })
        }
        
        const response: CreateApiKeyResponse = {
          success: true,
          apiKey: {
            id: apiKeyResult.id,
            name,
            key: apiKeyResult.key,
            createdAt: new Date()
          }
        }
        
        return c.json(response, 201)
        
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }
        
        console.error('Create API key error:', error)
        throw new HTTPException(500, { 
          message: 'Failed to create API key',
          cause: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  )

  // List user's API keys
  app.get('/api-keys', authMiddleware, async (c) => {
    try {
      const user = getCurrentUser(c)
      if (!user) {
        throw new HTTPException(401, { message: 'Authentication required' })
      }
      
      // Get user's API keys (without the actual key values)
      const apiKeys = await userService.getUserApiKeys(user.id)
      
      return c.json({
        success: true,
        apiKeys: apiKeys.map(key => ({
          id: key.id,
          name: key.name,
          lastUsedAt: key.lastUsedAt,
          createdAt: key.createdAt
        }))
      })
      
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      
      console.error('List API keys error:', error)
      throw new HTTPException(500, { 
        message: 'Failed to list API keys',
        cause: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  // Delete API key
  app.delete('/api-keys/:keyId', authMiddleware, async (c) => {
    try {
      const user = getCurrentUser(c)
      if (!user) {
        throw new HTTPException(401, { message: 'Authentication required' })
      }
      
      const keyId = c.req.param('keyId')
      if (!keyId) {
        throw new HTTPException(400, { message: 'API key ID is required' })
      }
      
      // Delete the API key
      const success = await userService.deleteApiKey(keyId, user.id)
      if (!success) {
        throw new HTTPException(404, { message: 'API key not found' })
      }
      
      return c.json({
        success: true,
        message: 'API key deleted successfully'
      })
      
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      
      console.error('Delete API key error:', error)
      throw new HTTPException(500, { 
        message: 'Failed to delete API key',
        cause: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  return app
}