import { pgTable, uuid, varchar, text, timestamp, boolean, jsonb, inet, index, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('user'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// API Keys table
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  keyHash: varchar('key_hash', { length: 255 }).notNull().unique(),
  lastUsedAt: timestamp('last_used_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('idx_api_keys_user_id').on(table.userId),
}))

// Projects table
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  ownerIdIdx: index('idx_projects_owner_id').on(table.ownerId),
}))

// Environments table
export const environments = pgTable('environments', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  projectIdIdx: index('idx_environments_project_id').on(table.projectId),
  projectNameUnique: unique('environments_project_id_name_unique').on(table.projectId, table.name),
}))

// Environment Variables table
export const environmentVariables = pgTable('environment_variables', {
  id: uuid('id').primaryKey().defaultRandom(),
  environmentId: uuid('environment_id').notNull().references(() => environments.id, { onDelete: 'cascade' }),
  key: varchar('key', { length: 255 }).notNull(),
  value: text('value').notNull(),
  encrypted: boolean('encrypted').notNull().default(false),
  sensitive: boolean('sensitive').notNull().default(false),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  environmentIdIdx: index('idx_environment_variables_environment_id').on(table.environmentId),
  environmentKeyUnique: unique('environment_variables_environment_id_key_unique').on(table.environmentId, table.key),
}))

// Project Permissions table
export const projectPermissions = pgTable('project_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 50 }).notNull(), // 'owner', 'admin', 'editor', 'viewer'
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('idx_project_permissions_user_id').on(table.userId),
  projectIdIdx: index('idx_project_permissions_project_id').on(table.projectId),
  userProjectUnique: unique('project_permissions_user_id_project_id_unique').on(table.userId, table.projectId),
}))

// Audit Logs table
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 255 }).notNull(),
  resource: varchar('resource', { length: 255 }).notNull(),
  resourceId: uuid('resource_id'),
  details: jsonb('details'),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('idx_audit_logs_user_id').on(table.userId),
  timestampIdx: index('idx_audit_logs_timestamp').on(table.timestamp),
  resourceIdx: index('idx_audit_logs_resource').on(table.resource, table.resourceId),
}))

// System Config table
export const systemConfig = pgTable('system_config', {
  key: varchar('key', { length: 255 }).primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// Define relations
export const usersRelations = relations(users, ({ many }) => ({
  apiKeys: many(apiKeys),
  ownedProjects: many(projects),
  projectPermissions: many(projectPermissions),
  auditLogs: many(auditLogs),
}))

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}))

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, {
    fields: [projects.ownerId],
    references: [users.id],
  }),
  environments: many(environments),
  permissions: many(projectPermissions),
}))

export const environmentsRelations = relations(environments, ({ one, many }) => ({
  project: one(projects, {
    fields: [environments.projectId],
    references: [projects.id],
  }),
  variables: many(environmentVariables),
}))

export const environmentVariablesRelations = relations(environmentVariables, ({ one }) => ({
  environment: one(environments, {
    fields: [environmentVariables.environmentId],
    references: [environments.id],
  }),
}))

export const projectPermissionsRelations = relations(projectPermissions, ({ one }) => ({
  user: one(users, {
    fields: [projectPermissions.userId],
    references: [users.id],
  }),
  project: one(projects, {
    fields: [projectPermissions.projectId],
    references: [projects.id],
  }),
}))

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}))

// Export types for use in services
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export type ApiKey = typeof apiKeys.$inferSelect
export type NewApiKey = typeof apiKeys.$inferInsert

export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert

export type Environment = typeof environments.$inferSelect
export type NewEnvironment = typeof environments.$inferInsert

export type EnvironmentVariable = typeof environmentVariables.$inferSelect
export type NewEnvironmentVariable = typeof environmentVariables.$inferInsert

export type ProjectPermission = typeof projectPermissions.$inferSelect
export type NewProjectPermission = typeof projectPermissions.$inferInsert

export type AuditLog = typeof auditLogs.$inferSelect
export type NewAuditLog = typeof auditLogs.$inferInsert

export type SystemConfig = typeof systemConfig.$inferSelect
export type NewSystemConfig = typeof systemConfig.$inferInsert

// Export all tables for use in queries
export const schema = {
  users,
  apiKeys,
  projects,
  environments,
  environmentVariables,
  projectPermissions,
  auditLogs,
  systemConfig,
}
