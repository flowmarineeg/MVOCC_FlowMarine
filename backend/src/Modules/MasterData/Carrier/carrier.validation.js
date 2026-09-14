import { body } from 'express-validator'

const optionalContractFields = [
  body('contractType').optional({ checkFalsy: true }).isIn(['Contract', 'Spot']).withMessage('Contract type must be Contract or Spot'),
  body('contractValidFrom').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid contract validity from date'),
  body('contractValidTo').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid contract validity to date'),
  body('localAgentName').optional().trim(),
  body('localAgentContact').optional().trim(),
  body('tradeLane').optional().trim(),
]

export const createRules = [
  body('name').trim().notEmpty().withMessage('Carrier name is required'),
  body('code').trim().notEmpty().withMessage('Carrier code is required'),
  ...optionalContractFields,
]

export const updateRules = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('code').optional().trim().notEmpty().withMessage('Code cannot be empty'),
  ...optionalContractFields,
]
