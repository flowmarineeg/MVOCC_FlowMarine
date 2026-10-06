import { body } from 'express-validator'
import { contactRules } from '../_shared/party.shared.js'

const optionalFields = [
  body('date').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid date'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email'),
  body('address').optional().trim(),
  body('country').optional().trim(),
  body('governorate').optional().trim(),
  body('phone').optional().trim(),
  body('taxNumber').optional().trim(),
  body('taxRegister').optional().trim(),
  ...contactRules,
]

export const createRules = [
  body('name').trim().notEmpty().withMessage('Customer name is required'),
  ...optionalFields,
]

export const updateRules = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  ...optionalFields,
]
