import { body } from 'express-validator'
import { basePartyRules, contractTypeRules } from '../_shared/party.shared.js'

const optionalFields = [body('code').optional().trim(), ...basePartyRules, ...contractTypeRules]

export const createRules = [
  body('name').trim().notEmpty().withMessage('Agent name is required'),
  ...optionalFields,
]

export const updateRules = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  ...optionalFields,
]
