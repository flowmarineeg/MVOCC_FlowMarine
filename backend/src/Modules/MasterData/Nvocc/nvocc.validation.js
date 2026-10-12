import { body } from 'express-validator'
import { basePartyRules, contractTypeRules } from '../_shared/party.shared.js'

const optionalFields = [...basePartyRules, ...contractTypeRules, body('tradeLane').optional().trim()]

export const createRules = [
  body('name').trim().notEmpty().withMessage('NVOCC name is required'),
  body('code').trim().notEmpty().withMessage('NVOCC code is required'),
  ...optionalFields,
]

export const updateRules = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('code').optional().trim().notEmpty().withMessage('Code cannot be empty'),
  ...optionalFields,
]
