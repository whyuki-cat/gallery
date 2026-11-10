import type Database from 'better-sqlite3'

import { HttpError } from './errors.js'
import {
  getDeletePassword,
  setDeletePassword as saveDeletePassword,
} from './library-repository.js'
import { hashPassword, isValidPassword, passwordRuleMessage, verifyPassword } from './password.js'

export interface SetPasswordInput {
  currentPassword?: unknown
  newPassword?: unknown
}

export function isDeletePasswordConfigured(db: Database.Database): boolean {
  return getDeletePassword(db) !== null
}

export function setDeletePassword(db: Database.Database, input: SetPasswordInput): void {
  if (!isValidPassword(input.newPassword)) {
    throw new HttpError(400, 'invalid-password', passwordRuleMessage())
  }

  const stored = getDeletePassword(db)
  if (stored) {
    if (
      typeof input.currentPassword !== 'string' ||
      !verifyPassword(input.currentPassword, stored)
    ) {
      throw new HttpError(403, 'invalid-delete-password', '当前删除保护密码不正确')
    }
  }

  saveDeletePassword(db, hashPassword(input.newPassword))
}

export function assertDeletePassword(db: Database.Database, password: unknown): void {
  const stored = getDeletePassword(db)
  if (!stored) {
    throw new HttpError(409, 'delete-password-not-configured', '请先在设置中设置删除保护密码')
  }
  if (typeof password !== 'string' || !verifyPassword(password, stored)) {
    throw new HttpError(403, 'invalid-delete-password', '删除保护密码不正确')
  }
}
