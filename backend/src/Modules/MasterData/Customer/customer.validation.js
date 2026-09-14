import { body } from 'express-validator'

export const createRules = [
  body('name').trim().notEmpty().withMessage('Customer name is required'),
  body('date').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid date'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email'),
  body('address').optional().trim(),
  body('phone').optional().trim(),
  body('taxNumber').optional().trim(),
  body('taxRegister').optional().trim(),
]

export const updateRules = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('date').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid date'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email'),
  body('address').optional().trim(),
  body('phone').optional().trim(),
  body('taxNumber').optional().trim(),
  body('taxRegister').optional().trim(),
]
