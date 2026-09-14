import { body } from 'express-validator'

export const quickAddRules = [
  body('containerType').isMongoId().withMessage('Container type is required'),
  body('nvocc').isMongoId().withMessage('NVOCC is required'),
  body('quantity')
    .isInt({ min: 1, max: 500 })
    .withMessage('Quantity must be a whole number between 1 and 500'),
]
