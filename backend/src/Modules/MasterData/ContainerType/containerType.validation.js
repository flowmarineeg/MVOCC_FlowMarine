import { body } from 'express-validator'

const capacityRules = [
  body('maxPayloadKg').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Max payload must be a positive number'),
  body('capacityCbm').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Capacity must be a positive number'),
]

export const createRules = [
  body('code').trim().notEmpty().withMessage('Code is required'),
  body('label').trim().notEmpty().withMessage('Label is required'),
  ...capacityRules,
]

export const updateRules = [
  body('code').optional().trim().notEmpty().withMessage('Code cannot be empty'),
  body('label').optional().trim().notEmpty().withMessage('Label cannot be empty'),
  ...capacityRules,
]
