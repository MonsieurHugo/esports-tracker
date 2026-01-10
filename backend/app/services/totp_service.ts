import { createHmac, randomBytes } from 'node:crypto'

/**
 * TOTP (Time-based One-Time Password) Service
 * Implements RFC 6238 for generating and verifying TOTP codes
 */
class TotpService {
  private readonly period: number = 30 // Time step in seconds
  private readonly digits: number = 6
  private readonly algorithm: string = 'sha1'

  /**
   * Generate a random secret key for TOTP
   */
  generateSecret(): string {
    // Generate 20 bytes (160 bits) of random data
    const buffer = randomBytes(20)
    return this.base32Encode(buffer)
  }

  /**
   * Generate recovery codes
   */
  generateRecoveryCodes(count: number = 8): string[] {
    const codes: string[] = []
    for (let i = 0; i < count; i++) {
      // Generate 8-character alphanumeric codes in format XXXX-XXXX
      const part1 = randomBytes(4).toString('hex').substring(0, 4).toUpperCase()
      const part2 = randomBytes(4).toString('hex').substring(0, 4).toUpperCase()
      codes.push(`${part1}-${part2}`)
    }
    return codes
  }

  /**
   * Verify a TOTP code
   * @param secret The base32-encoded secret
   * @param code The 6-digit code to verify
   * @param window Number of periods to check before/after current time (default 1)
   */
  verify(secret: string, code: string, window: number = 1): boolean {
    // Normalize code to 6 digits
    const normalizedCode = code.replace(/\s/g, '')
    if (!/^\d{6}$/.test(normalizedCode)) {
      return false
    }

    const secretBuffer = this.base32Decode(secret)
    const currentCounter = this.getCurrentCounter()

    // Check current period and surrounding windows
    for (let i = -window; i <= window; i++) {
      const expectedCode = this.generateCode(secretBuffer, currentCounter + i)
      if (this.timingSafeEqual(expectedCode, normalizedCode)) {
        return true
      }
    }

    return false
  }

  /**
   * Generate a TOTP code for the current time
   * @param secret The base32-encoded secret
   */
  generate(secret: string): string {
    const secretBuffer = this.base32Decode(secret)
    const counter = this.getCurrentCounter()
    return this.generateCode(secretBuffer, counter)
  }

  /**
   * Generate otpauth:// URI for QR code generation
   * @param secret The base32-encoded secret
   * @param email User's email
   * @param issuer Application name
   */
  generateQRCodeUri(secret: string, email: string, issuer: string = 'Esports Tracker'): string {
    const encodedIssuer = encodeURIComponent(issuer)
    const encodedEmail = encodeURIComponent(email)
    const encodedSecret = secret.replace(/\s/g, '')

    return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${encodedSecret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${this.digits}&period=${this.period}`
  }

  /**
   * Verify a recovery code
   * @param code The recovery code to verify
   * @param storedCodes Array of valid recovery codes
   * @returns The remaining codes if valid, null if invalid
   */
  verifyRecoveryCode(code: string, storedCodes: string[]): string[] | null {
    const normalizedCode = code.toUpperCase().replace(/\s/g, '')
    const index = storedCodes.findIndex(
      (stored) => this.timingSafeEqual(stored.replace(/-/g, ''), normalizedCode.replace(/-/g, ''))
    )

    if (index === -1) {
      return null
    }

    // Remove the used code and return remaining codes
    const remainingCodes = [...storedCodes]
    remainingCodes.splice(index, 1)
    return remainingCodes
  }

  /**
   * Get the current TOTP counter (time step)
   */
  private getCurrentCounter(): number {
    return Math.floor(Date.now() / 1000 / this.period)
  }

  /**
   * Generate a TOTP code for a specific counter
   */
  private generateCode(secret: Buffer, counter: number): string {
    // Convert counter to 8-byte big-endian buffer
    const counterBuffer = Buffer.alloc(8)
    counterBuffer.writeBigUInt64BE(BigInt(counter))

    // Generate HMAC-SHA1
    const hmac = createHmac(this.algorithm, secret)
    hmac.update(counterBuffer)
    const hash = hmac.digest()

    // Dynamic truncation
    const offset = hash[hash.length - 1] & 0x0f
    const binary =
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff)

    // Generate 6-digit code
    const otp = binary % Math.pow(10, this.digits)
    return otp.toString().padStart(this.digits, '0')
  }

  /**
   * Base32 encode a buffer
   */
  private base32Encode(buffer: Buffer): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    let result = ''
    let bits = 0
    let value = 0

    for (const byte of buffer) {
      value = (value << 8) | byte
      bits += 8

      while (bits >= 5) {
        result += alphabet[(value >>> (bits - 5)) & 31]
        bits -= 5
      }
    }

    if (bits > 0) {
      result += alphabet[(value << (5 - bits)) & 31]
    }

    return result
  }

  /**
   * Base32 decode a string
   */
  private base32Decode(input: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    const cleanInput = input.toUpperCase().replace(/\s/g, '').replace(/=/g, '')

    let bits = 0
    let value = 0
    const bytes: number[] = []

    for (const char of cleanInput) {
      const index = alphabet.indexOf(char)
      if (index === -1) continue

      value = (value << 5) | index
      bits += 5

      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 255)
        bits -= 8
      }
    }

    return Buffer.from(bytes)
  }

  /**
   * Timing-safe string comparison
   */
  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false
    }

    let result = 0
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i)
    }

    return result === 0
  }
}

// Export singleton instance
const totpService = new TotpService()
export default totpService
