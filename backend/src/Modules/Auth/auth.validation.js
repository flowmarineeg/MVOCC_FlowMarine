import { body } from 'express-validator'

export const loginRules = [
  body('email').trim().notEmpty().isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
]

export const forgotPasswordRules = [
  body('email').trim().notEmpty().isEmail().withMessage('Valid email is required'),
]

export const resetPasswordRules = [
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
]

export const changePasswordRules = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
]
