import { body } from 'express-validator'
import { UNIT_TYPES } from './unit.model.js'

export const createRules = [
  body('type').isIn(UNIT_TYPES).withMessage('Type must be length or weight'),
  body('name').trim().notEmpty().withMessage('Unit name is required'),
  body('symbol').trim().notEmpty().withMessage('Unit symbol is required'),
]

export const updateRules = [
  body('type').optional().isIn(UNIT_TYPES).withMessage('Type must be length or weight'),
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('symbol').optional().trim().notEmpty().withMessage('Symbol cannot be empty'),
]
