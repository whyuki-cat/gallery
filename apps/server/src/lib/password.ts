import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEY_LENGTH = 64
const SALT_LENGTH = 16
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 128

interface StoredPassword {
  algorithm: 'scrypt'
  salt: string
  hash: string
  keylen: number
  N: number
  r: number
  p: number
}

export function isValidPassword(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= MIN_PASSWORD_LENGTH &&
    value.length <= MAX_PASSWORD_LENGTH
  )
}

export function passwordRuleMessage(): string {
  return `密码长度需为 ${MIN_PASSWORD_LENGTH} 至 ${MAX_PASSWORD_LENGTH} 个字符`
}

export function hashPassword(password: string): string {
  if (!isValidPassword(password)) {
    throw new Error(passwordRuleMessage())
  }

  const salt = randomBytes(SALT_LENGTH)
  const hash = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })

  const stored: StoredPassword = {
    algorithm: 'scrypt',
    salt: salt.toString('base64'),
    hash: hash.toString('base64'),
    keylen: KEY_LENGTH,
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  }

  return JSON.stringify(stored)
}

export function verifyPassword(password: unknown, stored: string): boolean {
  if (typeof password !== 'string') return false

  let parsed: StoredPassword
  try {
    parsed = JSON.parse(stored) as StoredPassword
  } catch {
    return false
  }

  if (
    parsed.algorithm !== 'scrypt' ||
    typeof parsed.salt !== 'string' ||
    typeof parsed.hash !== 'string' ||
    typeof parsed.keylen !== 'number'
  ) {
    return false
  }

  try {
    const expected = Buffer.from(parsed.hash, 'base64')
    const actual = scryptSync(password, Buffer.from(parsed.salt, 'base64'), parsed.keylen, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
    })
    if (expected.length !== actual.length) return false
    return timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}
