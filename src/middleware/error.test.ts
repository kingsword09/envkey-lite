import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { errorHandler, ValidationError, ErrorCode } from './error.middleware'

describe('Error Handler Simple Test', () => {
  it('should handle ValidationError', async () => {
    const app = new Hono()
    
    app.onError(errorHandler)
    app.get('/test', () => {
      throw new ValidationError(ErrorCode.INVALID_INPUT, 'Test error')
    })

    const res = await app.request('http://localhost/test')
    
    console.log('Response status:', res.status)
    console.log('Response headers:', Object.fromEntries(res.headers.entries()))
    
    const text = await res.text()
    console.log('Response text:', text)
    
    expect(res.status).toBe(400)
  })
})