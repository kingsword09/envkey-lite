// Audit log type definitions
// Will be implemented in later tasks

export interface AuditEvent {
  userId?: string
  action: string
  resource: string
  resourceId?: string
  details?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}

export interface AuditLog extends AuditEvent {
  id: string
  timestamp: Date
}

export interface AuditFilters {
  userId?: string
  action?: string
  resource?: string
  startDate?: Date
  endDate?: Date
  limit?: number
  offset?: number
}
