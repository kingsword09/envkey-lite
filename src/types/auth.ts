// Authentication and authorization types
// Will be implemented in later tasks

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
