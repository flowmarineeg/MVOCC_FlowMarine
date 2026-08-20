import { body } from 'express-validator'

export const createRules = [
  body('code').trim().notEmpty().withMessage('Code is required'),
  body('label').trim().notEmpty().withMessage('Label is required'),
]

export const updateRules = [
  body('code').optional().trim().notEmpty().withMessage('Code cannot be empty'),
  body('label').optional().trim().notEmpty().withMessage('Label cannot be empty'),
]
