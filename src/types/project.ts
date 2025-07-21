// Project-related type definitions

export interface Project {
  id: string
  name: string
  description?: string
  ownerId: string
  createdAt: Date
  updatedAt: Date
}

export interface Environment {
  id: string
  name: string
  projectId: string
  createdAt: Date
  updatedAt: Date
}

export interface ProjectPermission {
  id: string
  userId: string
  projectId: string
  role: ProjectRole
  createdAt: Date
}

export type ProjectRole = 'owner' | 'admin' | 'editor' | 'viewer'

export interface CreateProjectData {
  name: string
  description?: string
  ownerId: string
}

export interface UpdateProjectData {
  name?: string
  description?: string
}

export interface CreateEnvironmentData {
  name: string
}