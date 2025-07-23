/**
 * API Usage Examples for EnvKey Lite
 */

export const apiExamples = {
  authentication: {
    login: {
      description: 'Login to get JWT token',
      curl: `curl -X POST http://localhost:3000/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "user@example.com",
    "password": "your-password"
  }'`
    },
    register: {
      description: 'Register a new user account',
      curl: `curl -X POST http://localhost:3000/api/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "newuser@example.com",
    "name": "Jane Doe",
    "password": "secure-password-123",
    "role": "user"
  }'`
    }
  },
  
  projects: {
    create: {
      description: 'Create a new project',
      curl: `curl -X POST http://localhost:3000/api/projects \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer your-jwt-token" \\
  -d '{
    "name": "My Web App",
    "description": "Production web application"
  }'`
    },
    
    list: {
      description: 'List all accessible projects',
      curl: `curl -X GET http://localhost:3000/api/projects \\
  -H "Authorization: Bearer your-jwt-token"`
    }
  },

  environments: {
    listVariables: {
      description: 'Get all environment variables',
      curl: `curl -X GET http://localhost:3000/api/environments/env-uuid/variables \\
  -H "Authorization: Bearer your-jwt-token"`
    },

    setVariable: {
      description: 'Set or update an environment variable',
      curl: `curl -X PUT http://localhost:3000/api/environments/env-uuid/variables/API_KEY \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer your-jwt-token" \\
  -d '{
    "value": "new-secret-value",
    "sensitive": true,
    "description": "Updated API key for external service"
  }'`
    },

    batchSet: {
      description: 'Set multiple environment variables at once',
      curl: `curl -X POST http://localhost:3000/api/environments/env-uuid/variables/batch \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer your-jwt-token" \\
  -d '{
    "variables": {
      "DATABASE_URL": "postgresql://user:pass@localhost:5432/mydb",
      "REDIS_URL": "redis://localhost:6379",
      "API_PORT": "3000",
      "NODE_ENV": "production"
    },
    "options": {
      "sensitive": false,
      "description": "Batch import from configuration file"
    }
  }'`
    }
  },

  client: {
    getVariables: {
      description: 'Get environment variables using API key (for client applications)',
      curl: `curl -X GET http://localhost:3000/api/client/env-uuid \\
  -H "X-API-Key: your-api-key"`,
      
      javascript: `// Using fetch in JavaScript/Node.js
const response = await fetch('http://localhost:3000/api/client/env-uuid', {
  headers: {
    'X-API-Key': 'your-api-key'
  }
});

const data = await response.json();
if (data.success) {
  // Use environment variables
  const dbUrl = data.variables.DATABASE_URL;
  const port = data.variables.API_PORT;
  console.log('Environment loaded:', Object.keys(data.variables).length, 'variables');
}`,

      python: `# Using requests in Python
import requests

response = requests.get(
    'http://localhost:3000/api/client/env-uuid',
    headers={'X-API-Key': 'your-api-key'}
)

if response.status_code == 200:
    data = response.json()
    if data['success']:
        variables = data['variables']
        # Use environment variables
        db_url = variables.get('DATABASE_URL')
        port = variables.get('API_PORT')
        print(f"Environment loaded: {len(variables)} variables")`
    }
  },

  apiKeys: {
    create: {
      description: 'Create a new API key for programmatic access',
      curl: `curl -X POST http://localhost:3000/api/auth/api-keys \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer your-jwt-token" \\
  -d '{
    "name": "Production Server Key"
  }'`
    },

    list: {
      description: 'List all API keys for the current user',
      curl: `curl -X GET http://localhost:3000/api/auth/api-keys \\
  -H "Authorization: Bearer your-jwt-token"`
    }
  }
}

export const quickStartGuide = {
  title: 'Quick Start Guide',
  steps: [
    {
      step: 1,
      title: 'Register or Login',
      description: 'Create an account or login to get your JWT token'
    },
    {
      step: 2,
      title: 'Create a Project',
      description: 'Projects organize your environments and variables'
    },
    {
      step: 3,
      title: 'Create an Environment',
      description: 'Environments separate your different deployment stages'
    },
    {
      step: 4,
      title: 'Set Environment Variables',
      description: 'Add your configuration variables to the environment'
    },
    {
      step: 5,
      title: 'Create API Key',
      description: 'Generate an API key for your application to access variables'
    },
    {
      step: 6,
      title: 'Access Variables in Your App',
      description: 'Use the client API to fetch variables in your application'
    }
  ]
}