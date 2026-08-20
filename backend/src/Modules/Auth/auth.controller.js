import { validationResult } from 'express-validator'
import * as service from './auth.service.js'
import { logAction, getRequestMeta } from '../AuditLog/auditLog.service.js'

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.COOKIE_SECURE === 'true',
  maxAge: 8 * 60 * 60 * 1000,
})

export const login = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })

    const { email, password } = req.body
    try {
      const { user, token } = await service.login({ email, password })
      res.cookie(process.env.JWT_COOKIE_NAME || 'nvocc_token', token, cookieOptions())
      await logAction({
        user, action: 'LOGIN', resource: 'Auth', resourceId: user._id, result: 'SUCCESS', ...getRequestMeta(req),
      })
      res.json({ success: true, data: user })
    } catch (err) {
      await logAction({
        userEmail: email, action: 'LOGIN', resource: 'Auth', result: 'FAILURE', ...getRequestMeta(req),
      })
      throw err
    }
  } catch (err) { next(err) }
}

export const logout = async (req, res, next) => {
  try {
    res.clearCookie(process.env.JWT_COOKIE_NAME || 'nvocc_token')
    res.json({ success: true })
  } catch (err) { next(err) }
}

export const me = async (req, res, next) => {
  try {
    const data = await service.getMe(req.user.id)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export const forgotPassword = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })

    await service.forgotPassword(req.body)
    await logAction({
      userEmail: req.body.email, action: 'FORGOT_PASSWORD', resource: 'Auth', result: 'SUCCESS', ...getRequestMeta(req),
    })
    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' })
  } catch (err) { next(err) }
}

export const resetPassword = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })

    try {
      await service.resetPassword({ token: req.params.token, password: req.body.password })
      await logAction({ action: 'RESET_PASSWORD', resource: 'Auth', result: 'SUCCESS', ...getRequestMeta(req) })
      res.json({ success: true, message: 'Password updated. Please log in.' })
    } catch (err) {
      await logAction({ action: 'RESET_PASSWORD', resource: 'Auth', result: 'FAILURE', ...getRequestMeta(req) })
      throw err
    }
  } catch (err) { next(err) }
}

export const changePassword = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })

    await service.changePassword(req.user.id, req.body)
    await logAction({
      user: req.user, action: 'CHANGE_PASSWORD', resource: 'Auth', resourceId: req.user.id, result: 'SUCCESS', ...getRequestMeta(req),
    })
    res.json({ success: true, message: 'Password changed.' })
  } catch (err) { next(err) }
}
