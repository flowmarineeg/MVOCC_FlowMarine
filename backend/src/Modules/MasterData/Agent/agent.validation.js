import { body } from 'express-validator'
import { partyRules } from '../_shared/party.shared.js'

const optionalFields = [body('country').optional().trim(), ...partyRules]

export const createRules = [
  body('name').trim().notEmpty().withMessage('Agent name is required'),
  body('code').trim().notEmpty().withMessage('Agent code is required'),
  ...optionalFields,
]

export const updateRules = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('code').optional().trim().notEmpty().withMessage('Code cannot be empty'),
  ...optionalFields,
]
