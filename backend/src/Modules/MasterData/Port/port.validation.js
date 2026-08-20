import { body } from 'express-validator'

export const createRules = [
  body('name').trim().notEmpty().withMessage('Port name is required'),
  body('code').trim().notEmpty().withMessage('Port code is required'),
  body('country').trim().notEmpty().withMessage('Country is required'),
]

export const updateRules = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('code').optional().trim().notEmpty().withMessage('Code cannot be empty'),
  body('country').optional().trim().notEmpty().withMessage('Country cannot be empty'),
]
