import { body } from 'express-validator'

export const createRules = [
  body('name').trim().notEmpty().withMessage('Agent name is required'),
  body('type').isIn(['POL', 'POD', 'BOTH']).withMessage('Type must be POL, POD, or BOTH'),
  body('email').optional().isEmail().withMessage('Invalid email'),
]

export const updateRules = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('type').optional().isIn(['POL', 'POD', 'BOTH']).withMessage('Type must be POL, POD, or BOTH'),
  body('email').optional().isEmail().withMessage('Invalid email'),
]
