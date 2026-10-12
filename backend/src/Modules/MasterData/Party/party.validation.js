import { body } from 'express-validator'
import { basePartyRules } from '../_shared/party.shared.js'
import { PARTY_TYPES } from './party.model.js'

export const createRules = [
  body('partyType').isIn(PARTY_TYPES).withMessage('Type must be shipper, consignee, or notify'),
  body('name').trim().notEmpty().withMessage('Party name is required'),
  ...basePartyRules,
]

export const updateRules = [
  body('partyType').optional().isIn(PARTY_TYPES).withMessage('Type must be shipper, consignee, or notify'),
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  ...basePartyRules,
]
