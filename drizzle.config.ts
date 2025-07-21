import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  // PGlite doesn't need traditional connection credentials
  // This config is mainly for schema generation and migrations
  verbose: true,
  strict: true,
  migrations: {
    prefix: 'timestamp',
  },
})
