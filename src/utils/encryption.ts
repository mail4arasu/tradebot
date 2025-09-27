import crypto from 'crypto'

const algorithm = 'aes-256-cbc'
const key = process.env.ENCRYPTION_KEY || 'your-32-character-encryption-key'

// Ensure key is exactly 32 bytes for AES-256
const keyBuffer = Buffer.from(key.slice(0, 32).padEnd(32, '0'), 'utf8')

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(algorithm, keyBuffer, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

export function decrypt(text: string): string {
  const textParts = text.split(':')
  const iv = Buffer.from(textParts.shift()!, 'hex')
  const encryptedText = textParts.join(':')
  const decipher = crypto.createDecipheriv(algorithm, keyBuffer, iv)
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}