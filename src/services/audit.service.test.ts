import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AuditService } from './audit.service'
import { DatabaseManager } from '../db'
import { AuditEvent } from '../types/audit'
import { auditLogs, users } from '../db/schema'

// Mock data
const TEST_USER_ID = '123e4567-e89b-12d3-a456-426614174000'
const TEST_RESOURCE_ID = '123e4567-e89b-12d3-a456-426614174001'

const mockAuditEvent: AuditEvent = {
  userId: TEST_USER_ID,
  action: 'create',
  resource: 'environment',
  resourceId: TEST_RESOURCE_ID,
  details: { name: 'production', projectId: '123e4567-e89b-12d3-a456-426614174002' },
  ipAddress: '127.0.0.1',
  userAgent: 'Mozilla/5.0',
}

describe('AuditService', () => {
  let dbManager: DatabaseManager
  let auditService: AuditService

  beforeEach(async () => {
    // Create an in-memory database for testing
    dbManager = new DatabaseManager({ autoMigrate: true })
    await dbManager.initialize()

    // Create a test user to satisfy foreign key constraints
    const db = dbManager.getDb()
    await db.insert(users).values({
      id: TEST_USER_ID,
      email: 'test@example.com',
      name: 'Test User',
      passwordHash: 'hash',
      role: 'admin',
    })

    // Create the audit service
    auditService = new AuditService(dbManager)
  })

  afterEach(async () => {
    // Clean up after each test
    await dbManager.close()
  })

  it('should log an audit event', async () => {
    // Log an audit event
    await auditService.log(mockAuditEvent)

    // Verify the event was logged
    const db = dbManager.getDb()
    const logs = await db.select().from(auditLogs).execute()

    expect(logs.length).toBe(1)
    expect(logs[0].userId).toBe(mockAuditEvent.userId)
    expect(logs[0].action).toBe(mockAuditEvent.action)
    expect(logs[0].resource).toBe(mockAuditEvent.resource)
    expect(logs[0].resourceId).toBe(mockAuditEvent.resourceId)
    expect(logs[0].details).toEqual(mockAuditEvent.details)
    expect(logs[0].ipAddress).toBe(mockAuditEvent.ipAddress)
    expect(logs[0].userAgent).toBe(mockAuditEvent.userAgent)
  })

  it('should get logs with filters', async () => {
    // Create multiple audit events
    const events = [
      { ...mockAuditEvent },
      { ...mockAuditEvent, action: 'update', resource: 'project' },
      { ...mockAuditEvent, action: 'delete' },
    ]

    for (const event of events) {
      await auditService.log(event)
    }

    // Test filtering by action
    const actionLogs = await auditService.getLogs({ action: 'create' })
    expect(actionLogs.data.length).toBe(1)
    expect(actionLogs.data[0].action).toBe('create')

    // Test filtering by resource
    const resourceLogs = await auditService.getLogs({ resource: 'project' })
    expect(resourceLogs.data.length).toBe(1)
    expect(resourceLogs.data[0].resource).toBe('project')

    // Test filtering by userId
    const userLogs = await auditService.getLogs({ userId: TEST_USER_ID })
    expect(userLogs.data.length).toBe(3)

    // Test pagination
    const allLogs = await auditService.getLogs({ pageSize: 2, page: 1 })
    expect(allLogs.data.length).toBe(2)
    expect(allLogs.total).toBe(3)
    expect(allLogs.totalPages).toBe(2)
    expect(allLogs.hasMore).toBe(true)

    const page2Logs = await auditService.getLogs({ pageSize: 2, page: 2 })
    expect(page2Logs.data.length).toBe(1)
    expect(page2Logs.hasMore).toBe(false)
  })

  it('should get resource logs', async () => {
    // Create multiple audit events for different resources
    const events = [
      { ...mockAuditEvent, resource: 'environment', resourceId: TEST_RESOURCE_ID },
      { ...mockAuditEvent, resource: 'environment', resourceId: TEST_RESOURCE_ID },
      {
        ...mockAuditEvent,
        resource: 'project',
        resourceId: '123e4567-e89b-12d3-a456-426614174003',
      },
    ]

    for (const event of events) {
      await auditService.log(event)
    }

    // Get logs for a specific resource
    const resourceLogs = await auditService.getResourceLogs('environment', TEST_RESOURCE_ID)
    expect(resourceLogs.length).toBe(2)
    expect(resourceLogs[0].resource).toBe('environment')
    expect(resourceLogs[0].resourceId).toBe(TEST_RESOURCE_ID)
  })

  it('should get user logs', async () => {
    // Create a second test user
    const secondUserId = '123e4567-e89b-12d3-a456-426614174999'
    const db = dbManager.getDb()
    await db.insert(users).values({
      id: secondUserId,
      email: 'test2@example.com',
      name: 'Test User 2',
      passwordHash: 'hash',
      role: 'user',
    })

    // Create multiple audit events for different users
    const events = [
      { ...mockAuditEvent, userId: TEST_USER_ID },
      { ...mockAuditEvent, userId: TEST_USER_ID },
      { ...mockAuditEvent, userId: secondUserId },
    ]

    for (const event of events) {
      await auditService.log(event)
    }

    // Get logs for a specific user
    const userLogs = await auditService.getUserLogs(TEST_USER_ID)
    expect(userLogs.length).toBe(2)
    expect(userLogs[0].userId).toBe(TEST_USER_ID)
    expect(userLogs[1].userId).toBe(TEST_USER_ID)
  })

  it('should clean up old logs', async () => {
    // Mock the Date object
    const realDate = Date
    const mockDate = new Date('2023-01-10T12:00:00Z')
    global.Date = class extends Date {
      constructor(date?: any) {
        if (date) {
          return new realDate(date)
        }
        return new realDate(mockDate)
      }
      static now() {
        return mockDate.getTime()
      }
    } as any

    // Create audit events with different timestamps
    const db = dbManager.getDb()

    // Insert logs with different dates
    await db.insert(auditLogs).values([
      {
        userId: TEST_USER_ID,
        action: 'create',
        resource: 'environment',
        timestamp: new Date('2023-01-01T12:00:00Z'), // 9 days old
      },
      {
        userId: TEST_USER_ID,
        action: 'update',
        resource: 'environment',
        timestamp: new Date('2023-01-05T12:00:00Z'), // 5 days old
      },
      {
        userId: TEST_USER_ID,
        action: 'delete',
        resource: 'environment',
        timestamp: new Date('2023-01-09T12:00:00Z'), // 1 day old
      },
    ])

    // Clean up logs older than 7 days
    const deletedCount = await auditService.cleanup(7)

    // Verify that only logs older than 7 days were deleted
    expect(deletedCount).toBe(1)

    const remainingLogs = await db.select().from(auditLogs).execute()
    expect(remainingLogs.length).toBe(2)

    // Restore the original Date
    global.Date = realDate
  })

  it('should get statistics', async () => {
    // Create a second test user
    const secondUserId = '123e4567-e89b-12d3-a456-426614174999'
    const db = dbManager.getDb()
    await db.insert(users).values({
      id: secondUserId,
      email: 'test2@example.com',
      name: 'Test User 2',
      passwordHash: 'hash',
      role: 'user',
    })

    // Create audit events with different properties
    const events = [
      { ...mockAuditEvent, action: 'create', resource: 'environment', userId: TEST_USER_ID },
      { ...mockAuditEvent, action: 'update', resource: 'environment', userId: TEST_USER_ID },
      { ...mockAuditEvent, action: 'create', resource: 'project', userId: secondUserId },
    ]

    for (const event of events) {
      await auditService.log(event)
    }

    // Get statistics
    const stats = await auditService.getStatistics()

    // Verify statistics
    expect(stats.totalLogs).toBe(3)
    expect(stats.actionCounts).toEqual({ create: 2, update: 1 })
    expect(stats.resourceCounts).toEqual({ environment: 2, project: 1 })
    expect(stats.userCounts).toHaveProperty(TEST_USER_ID)
    expect(stats.userCounts).toHaveProperty(secondUserId)
    expect(stats.userCounts[TEST_USER_ID]).toBe(2)
    expect(stats.userCounts[secondUserId]).toBe(1)
    expect(stats.dailyActivity.length).toBeGreaterThan(0)
  })

  it('should get recent activity', async () => {
    // Create multiple audit events
    const events = [
      { ...mockAuditEvent, action: 'create' },
      { ...mockAuditEvent, action: 'update' },
      { ...mockAuditEvent, action: 'delete' },
    ]

    for (const event of events) {
      await auditService.log(event)
    }

    // Get recent activity with limit
    const recentActivity = await auditService.getRecentActivity(2)

    // Verify recent activity
    expect(recentActivity.length).toBe(2)
    // The most recent logs should be returned (in reverse chronological order)
    expect(recentActivity[0].action).toBe('delete')
    expect(recentActivity[1].action).toBe('update')
  })

  it('should handle errors gracefully', async () => {
    // Mock the database to throw an error
    const db = dbManager.getDb()
    const mockSelect = vi.spyOn(db, 'select').mockImplementation(() => {
      throw new Error('Database error')
    })

    // Attempt to get logs
    await expect(auditService.getLogs()).rejects.toThrow('Failed to get audit logs')

    // Restore the original implementation
    mockSelect.mockRestore()
  })

  it('should search logs with text query', async () => {
    // Create audit events with searchable content
    const events = [
      {
        ...mockAuditEvent,
        action: 'create',
        resource: 'environment',
        details: { name: 'production' },
      },
      {
        ...mockAuditEvent,
        action: 'update',
        resource: 'project',
        details: { name: 'test-project' },
      },
      { ...mockAuditEvent, action: 'delete', resource: 'variable', details: { key: 'API_KEY' } },
    ]

    for (const event of events) {
      await auditService.log(event)
    }

    // Search by action
    const actionResults = await auditService.searchLogs('create')
    expect(actionResults.data.length).toBe(1)
    expect(actionResults.data[0]?.action).toBe('create')

    // Search by resource
    const resourceResults = await auditService.searchLogs('project')
    expect(resourceResults.data.length).toBe(1)
    expect(resourceResults.data[0]?.resource).toBe('project')

    // Search by details content
    const detailsResults = await auditService.searchLogs('API_KEY')
    expect(detailsResults.data.length).toBe(1)
    expect(detailsResults.data[0]?.details).toHaveProperty('key', 'API_KEY')
  })

  it('should archive logs', async () => {
    // Mock the Date object
    const realDate = Date
    const mockDate = new Date('2023-01-10T12:00:00Z')
    global.Date = class extends Date {
      constructor(date?: any) {
        super(date || mockDate)
      }
      static now() {
        return mockDate.getTime()
      }
    } as any

    // Create audit events with different timestamps
    const db = dbManager.getDb()

    // Insert logs with different dates
    await db.insert(auditLogs).values([
      {
        userId: TEST_USER_ID,
        action: 'create',
        resource: 'environment',
        timestamp: new Date('2023-01-01T12:00:00Z'), // 9 days old
      },
      {
        userId: TEST_USER_ID,
        action: 'update',
        resource: 'environment',
        timestamp: new Date('2023-01-05T12:00:00Z'), // 5 days old
      },
      {
        userId: TEST_USER_ID,
        action: 'delete',
        resource: 'environment',
        timestamp: new Date('2023-01-09T12:00:00Z'), // 1 day old
      },
    ])

    // Archive logs older than 7 days
    const archiveResult = await auditService.archiveLogs(7)

    // Verify the archive result
    expect(archiveResult).toContain('Archived')
    expect(archiveResult).toContain('audit_archive_')

    // Restore the original Date
    global.Date = realDate
  })
})
