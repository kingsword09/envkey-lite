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