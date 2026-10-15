import { body } from 'express-validator'
import { basePartyRules, contractTypeRules } from '../_shared/party.shared.js'

const optionalFields = [
  ...basePartyRules,
  ...contractTypeRules,
  body('tradeLane').optional().trim(),
  body('portsServed').optional().isArray().withMessage('Ports served must be a list'),
  body('portsServed.*').isMongoId().withMessage('Invalid port in ports served'),
  body('acceptsDg').optional().isBoolean().withMessage('Accepts DG must be true or false').toBoolean(),
  body('defaultFreeTimeDays').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Default free time must be a positive number'),
]

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
