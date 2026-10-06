import { body } from 'express-validator'
import { partyRules } from '../_shared/party.shared.js'

export const createRules = [
  body('name').trim().notEmpty().withMessage('Vessel operator name is required'),
  body('code').trim().notEmpty().withMessage('Vessel operator code is required'),
  ...partyRules,
]

export const updateRules = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('code').optional().trim().notEmpty().withMessage('Code cannot be empty'),
  ...partyRules,
]
