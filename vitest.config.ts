import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
        'src/db/migrations/',
        'eslint.config.js',
        'vitest.config.ts',
        'drizzle.config.ts'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    },
    setupFiles: ['./test/setup.ts']
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/types': path.resolve(__dirname, './src/types'),
      '@/services': path.resolve(__dirname, './src/services'),
      '@/middleware': path.resolve(__dirname, './src/middleware'),
      '@/routes': path.resolve(__dirname, './src/routes'),
      '@/db': path.resolve(__dirname, './src/db'),
      '@/utils': path.resolve(__dirname, './src/utils')
    }
  }
})