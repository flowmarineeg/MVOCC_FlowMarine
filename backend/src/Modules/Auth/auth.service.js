import User from './user.model.js'
import { hashPassword, comparePassword, generateRawToken, hashToken } from '../../utils/password.util.js'
import { signToken } from '../../utils/jwt.util.js'
import { sendPasswordResetEmail } from '../../utils/email.service.js'

const POPULATE_ROLE = { path: 'role', select: 'name permissions' }

const sanitize = (user) => {
  const obj = user.toObject ? user.toObject() : user
  delete obj.passwordHash
  delete obj.passwordResetTokenHash
  delete obj.passwordResetExpires
  return obj
}

export const login = async ({ email, password }) => {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash').populate(POPULATE_ROLE)
  const invalidCreds = () => Object.assign(new Error('Invalid credentials'), { statusCode: 401 })

  if (!user || user.status !== 'active' || !user.passwordHash) throw invalidCreds()

  const match = await comparePassword(password, user.passwordHash)
  if (!match) throw invalidCreds()

  user.lastLoginAt = new Date()
  await user.save()

  const token = signToken({ id: user._id.toString() })
  return { user: sanitize(user), token }
}

export const getMe = async (userId) => {
  const user = await User.findById(userId).populate(POPULATE_ROLE)
  if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 })
  return sanitize(user)
}

export const forgotPassword = async ({ email }) => {
  const user = await User.findOne({ email: email.toLowerCase() })
  if (!user || user.status !== 'active') return // silent — no account-enumeration leak

  const rawToken = generateRawToken()
  user.passwordResetTokenHash = hashToken(rawToken)
  user.passwordResetExpires = new Date(Date.now() + Number(process.env.PASSWORD_RESET_EXPIRES_MINUTES || 60) * 60 * 1000)
  await user.save()

  const resetLink = `${process.env.CLIENT_URL}/reset-password/${rawToken}`
  await sendPasswordResetEmail({ to: user.email, name: user.name, resetLink })
}

export const resetPassword = async ({ token, password }) => {
  const tokenHash = hashToken(token)
  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordResetTokenHash +passwordResetExpires')

  if (!user) throw Object.assign(new Error('Invalid or expired reset link'), { statusCode: 400 })

  user.passwordHash = await hashPassword(password)
  user.passwordResetTokenHash = null
  user.passwordResetExpires = null
  await user.save()
}

export const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await User.findById(userId).select('+passwordHash')
  if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 })

  const match = await comparePassword(currentPassword, user.passwordHash)
  if (!match) throw Object.assign(new Error('Current password is incorrect'), { statusCode: 401 })

  user.passwordHash = await hashPassword(newPassword)
  await user.save()
}
