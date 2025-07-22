import { CryptoService } from './src/services/crypto.service.js'

// Test password validation
const cryptoService = new CryptoService()

const result = cryptoService.validatePasswordStrength('securepassword123')
console.log('Password validation result:', result)