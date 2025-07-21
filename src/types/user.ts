// User-related type definitions
// Will be implemented in later tasks

export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
  createdAt: Date
  updatedAt: Date
}

export interface CreateUserData {
  email: string
  name: string
  password: string
  role?: 'admin' | 'user'
}

export interface UpdateUserData {
  name?: string
  email?: string
  role?: 'admin' | 'user'
}
