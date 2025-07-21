// Project-related type definitions
// Will be implemented in later tasks

export interface Project {
  id: string
  name: string
  description?: string
  ownerId: string
  createdAt: Date
  updatedAt: Date
}
