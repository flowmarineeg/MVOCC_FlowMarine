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
  // Sprint 007 — Step 3 container grid (PRD S3-24 .. S3-44)
  body('customsSealNo').optional().trim(),
  body('payloadWeightKg').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Payload weight must be a positive number'),
  body('cbm').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('CBM must be a positive number'),
  body('packagesInContainer').optional({ checkFalsy: true }).isInt({ min: 0 }).withMessage('Packages must be a whole number'),
  body('vgmMethod').optional({ checkFalsy: true }).isIn([1, 2, '1', '2']).withMessage('VGM method must be 1 or 2').toInt(),
  body('packingWeightKg').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Packing weight must be a positive number'),
  body('vgmWeightKg').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('VGM weight must be a positive number'),
  body('weighbridgeTicket').optional().trim(),
  body('vgmDeclaredBy').optional().trim(),
  body('vgmSubmittedAt').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid VGM submitted time'),
  body('conditionAtGateOut').optional({ checkFalsy: true }).isIn(['Sound', 'Damaged']).withMessage('Condition must be Sound or Damaged'),
  body('conditionNotes').optional().trim(),
  body('gateOutEirNo').optional().trim(),
  body('gateInEirNo').optional().trim(),
  body('gateOutDate').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid gate-out date'),
  body('lateGateInReason').optional().trim(),
]
