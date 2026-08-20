import { body } from 'express-validator'

export const inviteRules = [
  body('email').trim().notEmpty().isEmail().withMessage('Valid email is required'),
  body('roleId').isMongoId().withMessage('Valid role ID is required'),
]

export const updateMemberRoleRules = [
  body('roleId').isMongoId().withMessage('Valid role ID is required'),
]

export const acceptInvitationRules = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
]
