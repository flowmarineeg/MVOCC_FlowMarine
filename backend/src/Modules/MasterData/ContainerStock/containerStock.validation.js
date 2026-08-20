import { body } from 'express-validator'

export const updateRules = [
  body('availableCount')
    .isInt({ min: 0 })
    .withMessage('Available count must be a non-negative integer'),
]
