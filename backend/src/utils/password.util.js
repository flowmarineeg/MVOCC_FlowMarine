import bcrypt from 'bcryptjs'
import crypto from 'crypto'

const SALT_ROUNDS = 10

export const hashPassword = (plain) => bcrypt.hash(plain, SALT_ROUNDS)

export const comparePassword = (plain, hash) => bcrypt.compare(plain, hash)

// Shared by password-reset and invitation tokens: generate a random raw
// token to email out, but only ever persist its hash in the database.
export const generateRawToken = () => crypto.randomBytes(32).toString('hex')

export const hashToken = (rawToken) => crypto.createHash('sha256').update(rawToken).digest('hex')
