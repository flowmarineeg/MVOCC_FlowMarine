import { body } from 'express-validator'
import VesselOperator from '../VesselOperator/vesselOperator.model.js'

const operatorExists = async (id) => {
  if (!(await VesselOperator.exists({ _id: id }))) throw new Error('Vessel operator not found')
  return true
}

export const createRules = [
  body('vesselOperator').isMongoId().withMessage('Valid vessel operator required').bail().custom(operatorExists),
  body('name').trim().notEmpty().withMessage('Vessel name is required'),
  body('imoNumber').optional().trim(),
]

export const updateRules = [
  body('vesselOperator').optional().isMongoId().withMessage('Valid vessel operator required').bail().custom(operatorExists),
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('imoNumber').optional().trim(),
]
