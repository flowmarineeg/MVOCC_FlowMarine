import { body } from 'express-validator'
import { basePartyRules, contractTypeRules } from '../_shared/party.shared.js'

export const createRules = [
  body('name').trim().notEmpty().withMessage('Depot name is required'),
  body('code').trim().notEmpty().withMessage('Depot code is required'),
  ...basePartyRules, ...contractTypeRules,
]

export const updateRules = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('code').optional().trim().notEmpty().withMessage('Code cannot be empty'),
  ...basePartyRules, ...contractTypeRules,
]
