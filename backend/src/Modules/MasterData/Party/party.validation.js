import { body } from 'express-validator'
import { partyRules } from '../_shared/party.shared.js'
import { PARTY_TYPES } from './party.model.js'

export const createRules = [
  body('partyType').isIn(PARTY_TYPES).withMessage('Type must be shipper, consignee, or notify'),
  body('name').trim().notEmpty().withMessage('Party name is required'),
  body('code').trim().notEmpty().withMessage('Party code is required'),
  ...partyRules,
]

export const updateRules = [
  body('partyType').optional().isIn(PARTY_TYPES).withMessage('Type must be shipper, consignee, or notify'),
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('code').optional().trim().notEmpty().withMessage('Code cannot be empty'),
  ...partyRules,
]
