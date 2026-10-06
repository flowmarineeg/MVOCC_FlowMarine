import { body } from 'express-validator'

export const createRules = [
  body('name').trim().notEmpty().withMessage('Package name is required'),
]

export const updateRules = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
]
