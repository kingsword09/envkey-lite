# EnvKey Lite

A lightweight, self-hosted environment variable management system built with modern technologies.

## Features

- 🔐 Secure environment variable storage with encryption
- 🏗️ Project and environment organization
- 👥 User management and access control
- 🔑 API key authentication
- 📝 Audit logging
- 🌐 Web interface for management
- 🚀 Easy deployment with Docker
- 📊 Built-in monitoring and health checks

## Tech Stack

- **Backend**: Hono.js (Web framework)
- **Database**: PGlite (Embedded PostgreSQL)
- **ORM**: Drizzle ORM
- **Runtime**: Node.js
- **Language**: TypeScript

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Development Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd envkey-lite
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment configuration:
```bash
cp .env.example .env
```

4. Update the `.env` file with your configuration

5. Start development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### Production Deployment

#### Using Docker

1. Build and run with Docker Compose:
```bash
docker-compose up -d
```

#### Manual Deployment

1. Build the application:
```bash
npm run build
```

2. Start the production server:
```bash
npm start
```

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run lint` - Lint code
- `npm run lint:fix` - Fix linting issues
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting
- `npm run typecheck` - Type check without emitting
- `npm run db:generate` - Generate database migrations
- `npm run db:migrate` - Run database migrations
- `npm run db:studio` - Open Drizzle Studio

## Configuration

The application can be configured using environment variables. See `.env.example` for all available options.

### Key Configuration Options

- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port (default: 3000)
- `DATABASE_DIR` - PGlite data directory (empty for in-memory)
- `JWT_SECRET` - Secret for JWT token signing
- `ENCRYPTION_KEY` - Key for encrypting sensitive data

### Security Configuration

- `HTTPS_ENABLED` - Enable HTTPS server (default: false)
- `SSL_CERT_PATH` - Path to SSL certificate file
- `SSL_KEY_PATH` - Path to SSL private key file
- `HTTPS_PORT` - HTTPS server port (default: 3443)
- `FORCE_HTTPS` - Redirect HTTP to HTTPS (default: false)
- `SECURITY_HEADERS_ENABLED` - Enable security headers (default: true)
- `CSP_ENABLED` - Enable Content Security Policy (default: true)
- `HSTS_ENABLED` - Enable HTTP Strict Transport Security (default: true)
- `HSTS_MAX_AGE` - HSTS max age in seconds (default: 31536000)
- `FRAME_OPTIONS` - X-Frame-Options header value (default: DENY)

## Security Features

EnvKey Lite includes comprehensive security features to protect your environment variables and application:

### Security Headers

The application automatically adds security headers to all responses:

- **Content Security Policy (CSP)** - Prevents XSS attacks by controlling resource loading
- **X-Frame-Options** - Prevents clickjacking attacks
- **X-Content-Type-Options** - Prevents MIME type sniffing
- **X-XSS-Protection** - Enables browser XSS filtering
- **Referrer-Policy** - Controls referrer information sent with requests
- **Permissions-Policy** - Controls browser feature access
- **Cross-Origin-* Headers** - Controls cross-origin resource sharing

### HTTPS Support

For production deployments, HTTPS is strongly recommended:

1. Generate or obtain SSL certificates
2. Configure SSL certificate paths in environment variables
3. Enable HTTPS in configuration
4. Optionally enable HTTP to HTTPS redirection

Example HTTPS configuration:
```bash
HTTPS_ENABLED=true
SSL_CERT_PATH=/path/to/certificate.crt
SSL_KEY_PATH=/path/to/private.key
HTTPS_PORT=3443
FORCE_HTTPS=true
```

### Data Encryption

- Environment variables marked as sensitive are encrypted at rest
- JWT tokens are signed with configurable secrets
- API keys are hashed before storage
- All sensitive configuration requires secure keys in production

### Security Validation

The application validates security configuration on startup and provides warnings for:

- Missing HTTPS in production
- Weak JWT secrets
- Insecure CORS settings
- Missing SSL certificates when HTTPS is enabled

## API Documentation

API documentation will be available at `/docs` when the application is running.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License - see LICENSE file for details