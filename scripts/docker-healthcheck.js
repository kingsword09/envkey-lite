#!/usr/bin/env node

/**
 * Docker health check script
 * This script performs a health check for Docker containers
 */

const http = require('http')

const HEALTH_URL = process.env.HEALTH_CHECK_PATH || '/health'
const PORT = process.env.PORT || 3000
const HOST = process.env.HOST || 'localhost'
const TIMEOUT = 5000

function healthCheck() {
  const options = {
    hostname: HOST,
    port: PORT,
    path: HEALTH_URL,
    method: 'GET',
    timeout: TIMEOUT
  }

  const req = http.request(options, (res) => {
    let data = ''
    
    res.on('data', (chunk) => {
      data += chunk
    })
    
    res.on('end', () => {
      if (res.statusCode === 200) {
        try {
          const health = JSON.parse(data)
          if (health.status === 'healthy') {
            console.log('✅ Health check passed')
            process.exit(0)
          } else {
            console.error(`❌ Health check failed: ${health.status}`)
            process.exit(1)
          }
        } catch (error) {
          console.error('❌ Invalid health check response')
          process.exit(1)
        }
      } else {
        console.error(`❌ Health check failed with status: ${res.statusCode}`)
        process.exit(1)
      }
    })
  })

  req.on('error', (error) => {
    console.error(`❌ Health check request failed: ${error.message}`)
    process.exit(1)
  })

  req.on('timeout', () => {
    console.error('❌ Health check timed out')
    req.destroy()
    process.exit(1)
  })

  req.setTimeout(TIMEOUT)
  req.end()
}

// Run health check
healthCheck()