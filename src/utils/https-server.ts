import { readFileSync, existsSync } from 'fs'
import { createServer as createHttpsServer } from 'https'
import { createServer as createHttpServer } from 'http'
import { config } from './config'

export interface ServerOptions {
  port: number
  hostname?: string
  httpsPort?: number
  enableHttps?: boolean
  sslCertPath?: string
  sslKeyPath?: string
  forceHttps?: boolean
}

export interface ServerConfig {
  httpServer?: ReturnType<typeof createHttpServer>
  httpsServer?: ReturnType<typeof createHttpsServer>
  httpPort: number
  httpsPort?: number
  hostname: string
}

/**
 * Load SSL certificates
 */
function loadSSLCertificates(certPath: string, keyPath: string): { cert: string; key: string } {
  if (!existsSync(certPath)) {
    throw new Error(`SSL certificate file not found: ${certPath}`)
  }
  
  if (!existsSync(keyPath)) {
    throw new Error(`SSL private key file not found: ${keyPath}`)
  }
  
  try {
    const cert = readFileSync(certPath, 'utf8')
    const key = readFileSync(keyPath, 'utf8')
    
    return { cert, key }
  } catch (error) {
    throw new Error(`Failed to load SSL certificates: ${error}`)
  }
}

/**
 * Create HTTP redirect handler for HTTPS
 */
function createHttpsRedirectHandler(httpsPort: number) {
  return (req: any, res: any) => {
    const host = req.headers.host?.split(':')[0] || 'localhost'
    const httpsUrl = `https://${host}${httpsPort !== 443 ? `:${httpsPort}` : ''}${req.url}`
    
    res.writeHead(301, {
      'Location': httpsUrl,
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload'
    })
    res.end()
  }
}

/**
 * Create and configure servers
 */
export function createServers(
  fetchHandler: (request: Request) => Response | Promise<Response>,
  options: ServerOptions
): ServerConfig {
  const {
    port,
    hostname = 'localhost',
    httpsPort,
    enableHttps = false,
    sslCertPath,
    sslKeyPath,
    forceHttps = false
  } = options
  
  const serverConfig: ServerConfig = {
    httpPort: port,
    hostname
  }
  
  // Create HTTP server
  if (!enableHttps || !forceHttps) {
    serverConfig.httpServer = createHttpServer((req, res) => {
      // If HTTPS is enabled and force redirect is on, redirect to HTTPS
      if (enableHttps && forceHttps && httpsPort) {
        return createHttpsRedirectHandler(httpsPort)(req, res)
      }
      
      // Convert Node.js request to Web API Request
      const url = `http://${req.headers.host}${req.url}`
      const headers = new Headers()
      
      Object.entries(req.headers).forEach(([key, value]) => {
        if (value) {
          headers.set(key, Array.isArray(value) ? value.join(', ') : value)
        }
      })
      
      const request = new Request(url, {
        method: req.method,
        headers,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined
      })
      
      // Handle the request
      fetchHandler(request).then(response => {
        res.statusCode = response.status
        
        response.headers.forEach((value, key) => {
          res.setHeader(key, value)
        })
        
        if (response.body) {
          response.body.pipeTo(new WritableStream({
            write(chunk) {
              res.write(chunk)
            },
            close() {
              res.end()
            }
          }))
        } else {
          res.end()
        }
      }).catch(error => {
        console.error('Request handling error:', error)
        res.statusCode = 500
        res.end('Internal Server Error')
      })
    })
  }
  
  // Create HTTPS server if enabled
  if (enableHttps && sslCertPath && sslKeyPath && httpsPort) {
    try {
      const { cert, key } = loadSSLCertificates(sslCertPath, sslKeyPath)
      
      serverConfig.httpsServer = createHttpsServer({ cert, key }, (req, res) => {
        // Convert Node.js request to Web API Request
        const url = `https://${req.headers.host}${req.url}`
        const headers = new Headers()
        
        Object.entries(req.headers).forEach(([key, value]) => {
          if (value) {
            headers.set(key, Array.isArray(value) ? value.join(', ') : value)
          }
        })
        
        const request = new Request(url, {
          method: req.method,
          headers,
          body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined
        })
        
        // Handle the request
        fetchHandler(request).then(response => {
          res.statusCode = response.status
          
          response.headers.forEach((value, key) => {
            res.setHeader(key, value)
          })
          
          if (response.body) {
            response.body.pipeTo(new WritableStream({
              write(chunk) {
                res.write(chunk)
              },
              close() {
                res.end()
              }
            }))
          } else {
            res.end()
          }
        }).catch(error => {
          console.error('Request handling error:', error)
          res.statusCode = 500
          res.end('Internal Server Error')
        })
      })
      
      serverConfig.httpsPort = httpsPort
      
      console.log(`✅ HTTPS server configured on port ${httpsPort}`)
    } catch (error) {
      console.error('Failed to create HTTPS server:', error)
      throw error
    }
  }
  
  return serverConfig
}

/**
 * Start the configured servers
 */
export function startServers(serverConfig: ServerConfig): Promise<void> {
  const promises: Promise<void>[] = []
  
  // Start HTTP server
  if (serverConfig.httpServer) {
    promises.push(new Promise((resolve, reject) => {
      serverConfig.httpServer!.listen(serverConfig.httpPort, serverConfig.hostname, () => {
        console.log(`🌐 HTTP server listening on http://${serverConfig.hostname}:${serverConfig.httpPort}`)
        resolve()
      })
      
      serverConfig.httpServer!.on('error', reject)
    }))
  }
  
  // Start HTTPS server
  if (serverConfig.httpsServer && serverConfig.httpsPort) {
    promises.push(new Promise((resolve, reject) => {
      serverConfig.httpsServer!.listen(serverConfig.httpsPort!, serverConfig.hostname, () => {
        console.log(`🔒 HTTPS server listening on https://${serverConfig.hostname}:${serverConfig.httpsPort}`)
        resolve()
      })
      
      serverConfig.httpsServer!.on('error', reject)
    }))
  }
  
  return Promise.all(promises).then(() => {})
}

/**
 * Stop the configured servers
 */
export function stopServers(serverConfig: ServerConfig): Promise<void> {
  const promises: Promise<void>[] = []
  
  if (serverConfig.httpServer) {
    promises.push(new Promise(resolve => {
      serverConfig.httpServer!.close(() => resolve())
    }))
  }
  
  if (serverConfig.httpsServer) {
    promises.push(new Promise(resolve => {
      serverConfig.httpsServer!.close(() => resolve())
    }))
  }
  
  return Promise.all(promises).then(() => {})
}

/**
 * Validate HTTPS configuration
 */
export function validateHttpsConfig(): {
  isValid: boolean
  warnings: string[]
  errors: string[]
} {
  const warnings: string[] = []
  const errors: string[] = []
  
  if (config.HTTPS_ENABLED) {
    // Check for required SSL files
    if (!config.SSL_CERT_PATH) {
      errors.push('SSL_CERT_PATH is required when HTTPS is enabled')
    } else if (!existsSync(config.SSL_CERT_PATH)) {
      errors.push(`SSL certificate file not found: ${config.SSL_CERT_PATH}`)
    }
    
    if (!config.SSL_KEY_PATH) {
      errors.push('SSL_KEY_PATH is required when HTTPS is enabled')
    } else if (!existsSync(config.SSL_KEY_PATH)) {
      errors.push(`SSL private key file not found: ${config.SSL_KEY_PATH}`)
    }
    
    // Check port configuration
    if (config.HTTPS_PORT === config.PORT) {
      errors.push('HTTPS_PORT cannot be the same as HTTP PORT')
    }
    
    // Production warnings
    if (config.NODE_ENV === 'production') {
      if (!config.FORCE_HTTPS) {
        warnings.push('Consider enabling FORCE_HTTPS in production to redirect HTTP to HTTPS')
      }
      
      if (config.HTTPS_PORT !== 443) {
        warnings.push('Consider using port 443 for HTTPS in production')
      }
    }
  } else if (config.NODE_ENV === 'production') {
    warnings.push('HTTPS is not enabled in production environment')
  }
  
  return {
    isValid: errors.length === 0,
    warnings,
    errors
  }
}