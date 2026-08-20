import { body } from 'express-validator'
import { PERMISSION_KEYS } from './permissions.constants.js'

export const createRoleRules = [
  body('name').trim().notEmpty().withMessage('Role name is required'),
  body('permissions').isArray().withMessage('Permissions must be an array'),
  body('permissions.*').isIn(PERMISSION_KEYS).withMessage('Unknown permission key'),
  body('description').optional().trim(),
]

export const updateRoleRules = [
  body('name').optional().trim().notEmpty().withMessage('Role name cannot be empty'),
  body('permissions').optional().isArray().withMessage('Permissions must be an array'),
  body('permissions.*').optional().isIn(PERMISSION_KEYS).withMessage('Unknown permission key'),
  body('description').optional().trim(),
]
