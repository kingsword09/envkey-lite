// Environment-related type definitions
// Will be implemented in later tasks

export interface Environment {
  id: string
  name: string
  projectId: string
  createdAt: Date
  updatedAt: Date
}

export interface EnvironmentVariable {
  id: string
  environmentId: string
  key: string
  value: string
  encrypted: boolean
  sensitive: boolean
  description?: string
  createdAt: Date
  updatedAt: Date
}
