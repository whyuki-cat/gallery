import { describe, expect, it } from 'vitest'

import {
  hashPassword,
  isValidPassword,
  verifyPassword,
} from '../src/lib/password.js'

describe('delete password', () => {
  it('hashes without storing plaintext and verifies correctly', () => {
    const stored = hashPassword('correct-horse')
    expect(stored).not.toContain('correct-horse')
    expect(verifyPassword('correct-horse', stored)).toBe(true)
    expect(verifyPassword('wrong-password', stored)).toBe(false)
  })

  it('rejects malformed stored values', () => {
    expect(verifyPassword('anything', 'not-json')).toBe(false)
    expect(verifyPassword('anything', '{"algorithm":"md5"}')).toBe(false)
  })

  it('enforces the password length rule', () => {
    expect(isValidPassword('short')).toBe(false)
    expect(isValidPassword('long-enough')).toBe(true)
    expect(isValidPassword('x'.repeat(129))).toBe(false)
  })
})
