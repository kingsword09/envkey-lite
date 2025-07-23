import { and, eq } from 'drizzle-orm'
import { DatabaseManager } from '../db/manager'
import { 
  Environment, 
  NewEnvironment, 
  NewProject, 
  NewProjectPermission, 
  Project, 
  ProjectPermission, 
  environments, 
  projectPermissions, 
  projects 
} from '../db/schema'

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

export type ProjectRole = 'owner' | 'admin' | 'editor' | 'viewer'

export class ProjectService {
  private dbManager: DatabaseManager

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager
  }

  /**
   * Create a new project
   * @param data Project creation data
   * @returns The created project
   */
  async createProject(data: CreateProjectData): Promise<Project> {
    const db = this.dbManager.getDb()

    return this.dbManager.transaction(async (tx) => {
      // Create the project
      const newProject: NewProject = {
        name: data.name,
        description: data.description,
        ownerId: data.ownerId,
      }

      const [project] = await tx.db.insert(projects).values(newProject).returning()

      // Create owner permission
      const newPermission: NewProjectPermission = {
        userId: data.ownerId,
        projectId: project.id,
        role: 'owner',
      }

      await tx.db.insert(projectPermissions).values(newPermission)

      return project
    })
  }

  /**
   * Get a project by ID
   * @param id Project ID
   * @returns The project or null if not found
   */
  async getProject(id: string): Promise<Project | null> {
    // Validate UUID format to prevent database errors
    if (!this.isValidUuid(id)) {
      return null
    }
    
    const db = this.dbManager.getDb()
    const result = await db.select().from(projects).where(eq(projects.id, id))
    return result.length > 0 ? result[0] : null
  }
  
  /**
   * Validate if a string is a valid UUID
   * @param id String to validate
   * @returns True if valid UUID, false otherwise
   */
  private isValidUuid(id: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    return uuidRegex.test(id)
  }

  /**
   * List projects for a user
   * @param userId User ID
   * @returns Array of projects the user has access to
   */
  async listProjects(userId: string): Promise<Project[]> {
    const db = this.dbManager.getDb()
    
    // Get projects where user has permissions
    const result = await db
      .select({
        project: projects
      })
      .from(projectPermissions)
      .innerJoin(projects, eq(projectPermissions.projectId, projects.id))
      .where(eq(projectPermissions.userId, userId))
    
    return result.map(r => r.project)
  }

  /**
   * Update a project
   * @param id Project ID
   * @param data Project update data
   * @returns The updated project
   * @throws Error if project not found
   */
  async updateProject(id: string, data: UpdateProjectData): Promise<Project> {
    // Validate UUID format to prevent database errors
    if (!this.isValidUuid(id)) {
      throw new Error(`Project with ID ${id} not found`)
    }
    
    const db = this.dbManager.getDb()
    
    const [updatedProject] = await db
      .update(projects)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(projects.id, id))
      .returning()
    
    if (!updatedProject) {
      throw new Error(`Project with ID ${id} not found`)
    }
    
    return updatedProject
  }

  /**
   * Delete a project
   * @param id Project ID
   * @throws Error if project not found
   */
  async deleteProject(id: string): Promise<void> {
    // Validate UUID format to prevent database errors
    if (!this.isValidUuid(id)) {
      throw new Error(`Project with ID ${id} not found`)
    }
    
    const db = this.dbManager.getDb()
    
    // Due to cascade delete in schema, this will also delete:
    // - All environments
    // - All environment variables
    // - All project permissions
    const result = await db
      .delete(projects)
      .where(eq(projects.id, id))
      .returning({ id: projects.id })
    
    if (result.length === 0) {
      throw new Error(`Project with ID ${id} not found`)
    }
  }

  /**
   * Create a new environment for a project
   * @param projectId Project ID
   * @param data Environment creation data
   * @returns The created environment
   * @throws Error if project not found
   */
  async createEnvironment(projectId: string, data: CreateEnvironmentData): Promise<Environment> {
    const db = this.dbManager.getDb()
    
    // Check if project exists
    const projectExists = await this.getProject(projectId)
    if (!projectExists) {
      throw new Error(`Project with ID ${projectId} not found`)
    }
    
    // Check if environment with same name already exists
    const existingEnv = await db
      .select()
      .from(environments)
      .where(
        and(
          eq(environments.projectId, projectId),
          eq(environments.name, data.name)
        )
      )
    
    if (existingEnv.length > 0) {
      throw new Error(`Environment with name '${data.name}' already exists in this project`)
    }
    
    // Create the environment
    const newEnvironment: NewEnvironment = {
      name: data.name,
      projectId,
    }
    
    const [environment] = await db
      .insert(environments)
      .values(newEnvironment)
      .returning()
    
    return environment
  }

  /**
   * List environments for a project
   * @param projectId Project ID
   * @returns Array of environments
   */
  async listEnvironments(projectId: string): Promise<Environment[]> {
    const db = this.dbManager.getDb()
    
    return db
      .select()
      .from(environments)
      .where(eq(environments.projectId, projectId))
  }

  /**
   * Get an environment by ID
   * @param id Environment ID
   * @returns The environment or null if not found
   */
  async getEnvironment(id: string): Promise<Environment | null> {
    const db = this.dbManager.getDb()
    
    const result = await db
      .select()
      .from(environments)
      .where(eq(environments.id, id))
    
    return result.length > 0 ? result[0] : null
  }

  /**
   * Delete an environment
   * @param id Environment ID
   * @throws Error if environment not found
   */
  async deleteEnvironment(id: string): Promise<void> {
    const db = this.dbManager.getDb()
    
    // Due to cascade delete in schema, this will also delete all environment variables
    const result = await db
      .delete(environments)
      .where(eq(environments.id, id))
      .returning({ id: environments.id })
    
    if (result.length === 0) {
      throw new Error(`Environment with ID ${id} not found`)
    }
  }

  /**
   * Check if a user has permission for a project
   * @param userId User ID
   * @param projectId Project ID
   * @param requiredRole Minimum role required (defaults to 'viewer')
   * @returns True if user has permission, false otherwise
   */
  async checkPermission(
    userId: string, 
    projectId: string, 
    requiredRole: ProjectRole = 'viewer'
  ): Promise<boolean> {
    const db = this.dbManager.getDb()
    
    const result = await db
      .select()
      .from(projectPermissions)
      .where(
        and(
          eq(projectPermissions.userId, userId),
          eq(projectPermissions.projectId, projectId)
        )
      )
    
    if (result.length === 0) {
      return false
    }
    
    const userRole = result[0].role
    
    // Role hierarchy: owner > admin > editor > viewer
    const roleHierarchy: Record<ProjectRole, number> = {
      'owner': 4,
      'admin': 3,
      'editor': 2,
      'viewer': 1
    }
    
    return roleHierarchy[userRole as ProjectRole] >= roleHierarchy[requiredRole]
  }

  /**
   * Grant permission to a user for a project
   * @param userId User ID
   * @param projectId Project ID
   * @param role Role to grant
   */
  async grantPermission(userId: string, projectId: string, role: ProjectRole): Promise<ProjectPermission> {
    const db = this.dbManager.getDb()
    
    // Check if permission already exists
    const existingPermission = await db
      .select()
      .from(projectPermissions)
      .where(
        and(
          eq(projectPermissions.userId, userId),
          eq(projectPermissions.projectId, projectId)
        )
      )
    
    if (existingPermission.length > 0) {
      // Update existing permission
      const [updatedPermission] = await db
        .update(projectPermissions)
        .set({ role })
        .where(eq(projectPermissions.id, existingPermission[0].id))
        .returning()
      
      return updatedPermission
    } else {
      // Create new permission
      const newPermission: NewProjectPermission = {
        userId,
        projectId,
        role,
      }
      
      const [permission] = await db
        .insert(projectPermissions)
        .values(newPermission)
        .returning()
      
      return permission
    }
  }

  /**
   * Revoke permission from a user for a project
   * @param userId User ID
   * @param projectId Project ID
   * @returns True if permission was revoked, false if it didn't exist
   */
  async revokePermission(userId: string, projectId: string): Promise<boolean> {
    const db = this.dbManager.getDb()
    
    // Cannot revoke owner permission
    const isOwner = await this.isProjectOwner(userId, projectId)
    if (isOwner) {
      throw new Error('Cannot revoke permission from project owner')
    }
    
    const result = await db
      .delete(projectPermissions)
      .where(
        and(
          eq(projectPermissions.userId, userId),
          eq(projectPermissions.projectId, projectId)
        )
      )
      .returning({ id: projectPermissions.id })
    
    return result.length > 0
  }

  /**
   * List all permissions for a project
   * @param projectId Project ID
   * @returns Array of project permissions
   */
  async listProjectPermissions(projectId: string): Promise<ProjectPermission[]> {
    const db = this.dbManager.getDb()
    
    return db
      .select()
      .from(projectPermissions)
      .where(eq(projectPermissions.projectId, projectId))
  }

  /**
   * Check if a user is the owner of a project
   * @param userId User ID
   * @param projectId Project ID
   * @returns True if user is the owner, false otherwise
   */
  async isProjectOwner(userId: string, projectId: string): Promise<boolean> {
    const project = await this.getProject(projectId)
    return project?.ownerId === userId
  }

  /**
   * Get a project with its environments
   * @param projectId Project ID
   * @returns Project with environments or null if not found
   */
  async getProjectWithEnvironments(projectId: string): Promise<(Project & { environments: Environment[] }) | null> {
    const project = await this.getProject(projectId)
    if (!project) {
      return null
    }
    
    const projectEnvironments = await this.listEnvironments(projectId)
    
    return {
      ...project,
      environments: projectEnvironments
    }
  }

  /**
   * Transfer project ownership to another user
   * @param projectId Project ID
   * @param newOwnerId New owner user ID
   * @throws Error if project not found or new owner doesn't exist
   */
  async transferOwnership(projectId: string, newOwnerId: string): Promise<void> {
    // Validate UUID format to prevent database errors
    if (!this.isValidUuid(projectId) || !this.isValidUuid(newOwnerId)) {
      throw new Error(`Invalid project ID or user ID`)
    }
    
    return this.dbManager.transaction(async (tx) => {
      // Get the current project to find the old owner
      const projectResult = await tx.db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
      
      if (projectResult.length === 0) {
        throw new Error(`Project with ID ${projectId} not found`)
      }
      
      const oldOwnerId = projectResult[0].ownerId
      
      // Update project owner
      const [updatedProject] = await tx.db
        .update(projects)
        .set({ 
          ownerId: newOwnerId,
          updatedAt: new Date()
        })
        .where(eq(projects.id, projectId))
        .returning()
      
      if (!updatedProject) {
        throw new Error(`Project with ID ${projectId} not found`)
      }
      
      // Update permissions - ensure new owner has owner role
      const existingPermission = await tx.db
        .select()
        .from(projectPermissions)
        .where(
          and(
            eq(projectPermissions.userId, newOwnerId),
            eq(projectPermissions.projectId, projectId)
          )
        )
      
      if (existingPermission.length > 0) {
        // Update existing permission to owner
        await tx.db
          .update(projectPermissions)
          .set({ role: 'owner' })
          .where(eq(projectPermissions.id, existingPermission[0].id))
      } else {
        // Create new owner permission
        await tx.db
          .insert(projectPermissions)
          .values({
            userId: newOwnerId,
            projectId,
            role: 'owner'
          })
      }
      
      // Demote old owner to admin if they had owner permission
      if (oldOwnerId !== newOwnerId) {
        const oldOwnerPermission = await tx.db
          .select()
          .from(projectPermissions)
          .where(
            and(
              eq(projectPermissions.userId, oldOwnerId),
              eq(projectPermissions.projectId, projectId)
            )
          )
        
        if (oldOwnerPermission.length > 0) {
          await tx.db
            .update(projectPermissions)
            .set({ role: 'admin' })
            .where(eq(projectPermissions.id, oldOwnerPermission[0].id))
        } else {
          // Create admin permission for old owner if they don't have any permission
          await tx.db
            .insert(projectPermissions)
            .values({
              userId: oldOwnerId,
              projectId,
              role: 'admin'
            })
        }
      }
    })
  }
}