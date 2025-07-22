import { PGlite } from '@electric-sql/pglite'
import { DatabaseManager } from './src/db/manager.js'
import { CryptoService } from './src/services/crypto.service.js'
import { createAuthRoutes } from './src/routes/auth.routes.js'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from './src/db/schema.js'

async function debug() {
  // Create in-memory database for testing
  const db = new PGlite()
  
  // Initialize database manager
  const dbManager = new DatabaseManager()
  await dbManager.initialize({ database: db })
  
  // Run migrations
  const drizzleDb = drizzle(db, { schema })
  await migrate(drizzleDb, { migrationsFolder: './src/db/migrations' })
  
  // Initialize crypto service
  const cryptoService = new CryptoService(dbManager)
  await cryptoService.initialize()
  
  // Create the auth routes app
  const jwtSecret = 'test-jwt-secret-key-for-testing-only'
  const app = createAuthRoutes(dbManager, cryptoService, jwtSecret)

  const userData = {
    email: 'test@example.com',
    name: 'Test User',
    password: 'securepassword123',
    role: 'user'
  }

  const response = await app.request('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData)
  })

  console.log('Status:', response.status)
  console.log('Headers:', Object.fromEntries(response.headers.entries()))
  
  const text = await response.text()
  console.log('Response text:', text)
  
  await dbManager.close()
  await db.close()
}

debug().catch(console.error)