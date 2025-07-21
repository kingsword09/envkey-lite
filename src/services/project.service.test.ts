import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DatabaseManager } from '../db/manager'
import { ProjectService, CreateProjectData, UpdateProjectData, CreateEnvironmentData } from './project.service'
import { UserService } from './user.service'
import { CryptoService } from './crypto.service'
import { Project, Environment, ProjectPermission } from '../types/project'

describe('ProjectService', () => {
  let dbManager: DatabaseManager
  let cryptoService: CryptoService
  let projectService: ProjectService
  let userService: UserService
  let testUser: { id: string; email: string }
  let secondUser: { id: string; email: string }

  beforeEach(async () => {
    // Create in-memory database for testing
    dbManager = new DatabaseManager({ autoMigrate: true })
    await dbManager.initialize()
    
    // Create services
    cryptoService = new CryptoService(dbManager)
    await cryptoService.initialize('test-secret')
    
    projectService = new ProjectService(dbManager)
    userService = new UserService(dbManager, cryptoService)
    
    // Create test users
    const user = await userService.createUser({
      email: 'test@example.com',
      name: 'Test User',
      password: 'password123',
      role: 'user'
    })
    testUser = { id: user.id, email: user.email }
    
    const user2 = await userService.createUser({
      email: 'test2@example.com',
      name: 'Test User 2',
      password: 'password123',
      role: 'user'
    })
    secondUser = { id: user2.id, email: user2.email }
  })

  afterEach(async () => {
    await dbManager.close()
  })

  describe('Project Management', () => {
    it('should create a project', async () => {
      const projectData: CreateProjectData = {
        name: 'Test Project',
        description: 'A test project',
        ownerId: testUser.id
      }

      const project = await projectService.createProject(projectData)

      expect(project).toBeDefined()
      expect(project.id).toBeDefined()
      expect(project.name).toBe(projectData.name)
      expect(project.description).toBe(projectData.description)
      expect(project.ownerId).toBe(testUser.id)
      expect(project.createdAt).toBeInstanceOf(Date)
      expect(project.updatedAt).toBeInstanceOf(Date)
    })

    it('should get a project by ID', async () => {
      const projectData: CreateProjectData = {
        name: 'Test Project',
        description: 'A test project',
        ownerId: testUser.id
      }

      const createdProject = await projectService.createProject(projectData)
      const project = await projectService.getProject(createdProject.id)

      expect(project).toBeDefined()
      expect(project?.id).toBe(createdProject.id)
      expect(project?.name).toBe(projectData.name)
    })

    it('should return null when getting non-existent project', async () => {
      const project = await projectService.getProject('non-existent-id')
      expect(project).toBeNull()
    })

    it('should list projects for a user', async () => {
      // Create two projects for the test user
      await projectService.createProject({
        name: 'Project 1',
        ownerId: testUser.id
      })

      await projectService.createProject({
        name: 'Project 2',
        ownerId: testUser.id
      })

      // Create a project for another user
      await projectService.createProject({
        name: 'Other User Project',
        ownerId: secondUser.id
      })

      // Grant permission to test user for the second user's project
      const otherProjects = await projectService.listProjects(secondUser.id)
      await projectService.grantPermission(testUser.id, otherProjects[0].id, 'viewer')

      // List projects for test user
      const projects = await projectService.listProjects(testUser.id)

      // Should see 3 projects (2 owned + 1 with permission)
      expect(projects).toHaveLength(3)
      expect(projects.some(p => p.name === 'Project 1')).toBe(true)
      expect(projects.some(p => p.name === 'Project 2')).toBe(true)
      expect(projects.some(p => p.name === 'Other User Project')).toBe(true)
    })

    it('should update a project', async () => {
      const project = await projectService.createProject({
        name: 'Original Name',
        description: 'Original description',
        ownerId: testUser.id
      })

      const updateData: UpdateProjectData = {
        name: 'Updated Name',
        description: 'Updated description'
      }

      const updatedProject = await projectService.updateProject(project.id, updateData)

      expect(updatedProject.name).toBe(updateData.name)
      expect(updatedProject.description).toBe(updateData.description)
      expect(updatedProject.id).toBe(project.id)
      expect(updatedProject.ownerId).toBe(project.ownerId)
    })

    it('should throw error when updating non-existent project', async () => {
      const updateData: UpdateProjectData = {
        name: 'Updated Name'
      }

      await expect(projectService.updateProject('non-existent-id', updateData))
        .rejects.toThrow('Project with ID non-existent-id not found')
    })

    it('should delete a project', async () => {
      const project = await projectService.createProject({
        name: 'Project to Delete',
        ownerId: testUser.id
      })

      await projectService.deleteProject(project.id)

      const deletedProject = await projectService.getProject(project.id)
      expect(deletedProject).toBeNull()
    })

    it('should throw error when deleting non-existent project', async () => {
      await expect(projectService.deleteProject('non-existent-id'))
        .rejects.toThrow('Project with ID non-existent-id not found')
    })
  })

  describe('Environment Management', () => {
    let testProject: Project

    beforeEach(async () => {
      testProject = await projectService.createProject({
        name: 'Test Project',
        ownerId: testUser.id
      })
    })

    it('should create an environment', async () => {
      const envData: CreateEnvironmentData = {
        name: 'development'
      }

      const environment = await projectService.createEnvironment(testProject.id, envData)

      expect(environment).toBeDefined()
      expect(environment.id).toBeDefined()
      expect(environment.name).toBe(envData.name)
      expect(environment.projectId).toBe(testProject.id)
      expect(environment.createdAt).toBeInstanceOf(Date)
      expect(environment.updatedAt).toBeInstanceOf(Date)
    })

    it('should throw error when creating environment with duplicate name', async () => {
      await projectService.createEnvironment(testProject.id, { name: 'development' })

      await expect(projectService.createEnvironment(testProject.id, { name: 'development' }))
        .rejects.toThrow("Environment with name 'development' already exists in this project")
    })

    it('should list environments for a project', async () => {
      await projectService.createEnvironment(testProject.id, { name: 'development' })
      await projectService.createEnvironment(testProject.id, { name: 'staging' })
      await projectService.createEnvironment(testProject.id, { name: 'production' })

      const environments = await projectService.listEnvironments(testProject.id)

      expect(environments).toHaveLength(3)
      expect(environments.some(e => e.name === 'development')).toBe(true)
      expect(environments.some(e => e.name === 'staging')).toBe(true)
      expect(environments.some(e => e.name === 'production')).toBe(true)
    })

    it('should get an environment by ID', async () => {
      const createdEnv = await projectService.createEnvironment(testProject.id, { name: 'development' })
      const environment = await projectService.getEnvironment(createdEnv.id)

      expect(environment).toBeDefined()
      expect(environment?.id).toBe(createdEnv.id)
      expect(environment?.name).toBe('development')
      expect(environment?.projectId).toBe(testProject.id)
    })

    it('should delete an environment', async () => {
      const environment = await projectService.createEnvironment(testProject.id, { name: 'development' })
      await projectService.deleteEnvironment(environment.id)

      const deletedEnv = await projectService.getEnvironment(environment.id)
      expect(deletedEnv).toBeNull()
    })
  })

  describe('Permission Management', () => {
    let testProject: Project

    beforeEach(async () => {
      testProject = await projectService.createProject({
        name: 'Test Project',
        ownerId: testUser.id
      })
    })

    it('should check if user has permission', async () => {
      // Owner should have permission
      let hasPermission = await projectService.checkPermission(testUser.id, testProject.id, 'owner')
      expect(hasPermission).toBe(true)

      // Second user should not have permission
      hasPermission = await projectService.checkPermission(secondUser.id, testProject.id, 'viewer')
      expect(hasPermission).toBe(false)
    })

    it('should grant permission to a user', async () => {
      const permission = await projectService.grantPermission(secondUser.id, testProject.id, 'editor')

      expect(permission).toBeDefined()
      expect(permission.userId).toBe(secondUser.id)
      expect(permission.projectId).toBe(testProject.id)
      expect(permission.role).toBe('editor')

      // Check if permission was granted
      const hasPermission = await projectService.checkPermission(secondUser.id, testProject.id, 'editor')
      expect(hasPermission).toBe(true)
    })

    it('should update existing permission', async () => {
      // Grant editor permission
      await projectService.grantPermission(secondUser.id, testProject.id, 'editor')

      // Update to admin permission
      const updatedPermission = await projectService.grantPermission(secondUser.id, testProject.id, 'admin')

      expect(updatedPermission.role).toBe('admin')

      // Check if permission was updated
      const hasEditorPermission = await projectService.checkPermission(secondUser.id, testProject.id, 'editor')
      const hasAdminPermission = await projectService.checkPermission(secondUser.id, testProject.id, 'admin')
      expect(hasEditorPermission).toBe(true) // Admin should have editor permissions
      expect(hasAdminPermission).toBe(true)
    })

    it('should revoke permission from a user', async () => {
      // Grant permission
      await projectService.grantPermission(secondUser.id, testProject.id, 'viewer')

      // Revoke permission
      const revoked = await projectService.revokePermission(secondUser.id, testProject.id)
      expect(revoked).toBe(true)

      // Check if permission was revoked
      const hasPermission = await projectService.checkPermission(secondUser.id, testProject.id, 'viewer')
      expect(hasPermission).toBe(false)
    })

    it('should not allow revoking owner permission', async () => {
      await expect(projectService.revokePermission(testUser.id, testProject.id))
        .rejects.toThrow('Cannot revoke permission from project owner')
    })

    it('should list project permissions', async () => {
      // Grant permissions to second user
      await projectService.grantPermission(secondUser.id, testProject.id, 'editor')

      const permissions = await projectService.listProjectPermissions(testProject.id)

      expect(permissions).toHaveLength(2) // Owner + second user
      expect(permissions.some(p => p.userId === testUser.id && p.role === 'owner')).toBe(true)
      expect(permissions.some(p => p.userId === secondUser.id && p.role === 'editor')).toBe(true)
    })

    it('should transfer project ownership', async () => {
      await projectService.transferOwnership(testProject.id, secondUser.id)

      // Check if ownership was transferred
      const project = await projectService.getProject(testProject.id)
      expect(project?.ownerId).toBe(secondUser.id)

      // Check if permissions were updated
      const permissions = await projectService.listProjectPermissions(testProject.id)
      expect(permissions.some(p => p.userId === secondUser.id && p.role === 'owner')).toBe(true)
      expect(permissions.some(p => p.userId === testUser.id && p.role === 'admin')).toBe(true)
    })
  })
})