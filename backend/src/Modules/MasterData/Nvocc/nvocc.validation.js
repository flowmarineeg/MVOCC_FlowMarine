import { body } from 'express-validator'

export const createRules = [
  body('name').trim().notEmpty().withMessage('NVOCC name is required'),
  body('code').trim().notEmpty().withMessage('NVOCC code is required'),
]

export const updateRules = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('code').optional().trim().notEmpty().withMessage('Code cannot be empty'),
]
