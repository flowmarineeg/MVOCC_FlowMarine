import { body } from 'express-validator'

export const quickAddRules = [
  body('containerType').isMongoId().withMessage('Container type is required'),
  body('nvocc').isMongoId().withMessage('NVOCC is required'),
  body('depot').isMongoId().withMessage('Depot is required'),
  body('quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be a whole number of at least 1'),
]

// Per-unit operational fields — editable only while a unit is allocated to a
// booking (see updateContainerUnit() in container.service.js).
export const updateUnitRules = [
  body('sealNumber').optional().trim(),
  body('guaranteeReceiptStatus').optional({ checkFalsy: true }).isIn(['Received', 'Pending']).withMessage('Invalid guarantee receipt status'),
  body('containerStatus').optional({ checkFalsy: true }).isIn(['Empty Assigned', 'Gated-In', 'Loaded', 'Departed']).withMessage('Invalid container status'),
  body('gateInDate').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid gate-in date'),
  body('vasUploadStatus').optional({ checkFalsy: true }).isIn(['Not Uploaded', 'Uploaded']).withMessage('Invalid VAS upload status'),
]
