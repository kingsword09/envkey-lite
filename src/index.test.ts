import { describe, it, expect } from 'vitest'

describe('Infrastructure Test', () => {
  it('should pass basic test', () => {
    expect(1 + 1).toBe(2)
  })

  it('should have access to environment variables', () => {
    expect(process.env).toBeDefined()
  })
})
