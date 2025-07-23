import { Hono } from 'hono'
import { swaggerUI } from '@hono/swagger-ui'
import { openApiSpec } from '../docs/openapi'
import { apiExamples, quickStartGuide } from '../docs/examples'

/**
 * Documentation routes
 * Serves OpenAPI specification and interactive documentation
 */
export function createDocsRoutes(): Hono {
  const app = new Hono()

  // Serve OpenAPI JSON specification
  app.get('/openapi.json', (c) => {
    return c.json(openApiSpec)
  })

  // Serve interactive Swagger UI documentation
  app.get('/ui', swaggerUI({ url: '/docs/openapi.json' }))

  // Serve API examples
  app.get('/examples', (c) => {
    return c.json({
      examples: apiExamples,
      quickStart: quickStartGuide
    })
  })

  // Serve custom documentation page
  app.get('/guide', (c) => {
    return c.redirect('/docs.html')
  })

  // Redirect root docs path to custom guide
  app.get('/', (c) => {
    return c.redirect('/docs.html')
  })

  return app
}