import { body } from 'express-validator'
import mongoose from 'mongoose'
import ContainerType from '../../MasterData/ContainerType/containerType.model.js'
import { ORIGIN_LINE_KEYS, DESTINATION_LINE_KEYS } from './quotation.model.js'

// Same shape as booking.validation.js's validateContainerEntries — checks
// for duplicate container types and confirms every referenced ContainerType
// actually exists (isMongoId() only checks the format looks right).
const validateContainerEntries = async (containers) => {
  if (!Array.isArray(containers)) return true
  const ids = containers.map((c) => c?.containerType).filter(Boolean)
  const uniqueIds = new Set(ids.map(String))
  if (uniqueIds.size !== ids.length) {
    throw new Error('Each container type can only appear once per quotation')
  }
  const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id))
  if (validIds.length > 0) {
    const count = await ContainerType.countDocuments({ _id: { $in: validIds } })
    if (count !== uniqueIds.size) {
      throw new Error('One or more container types do not exist')
    }
  }
  return true
}

const RATE_LINE_FIELDS = ['rate20', 'rate40', 'qty20', 'qty40']

// Rules for one rate table (Origin or Destination, Buying or Selling):
// every fixed line and every free-form custom line carries the same four
// optional non-negative numbers. `prefix` is e.g. 'buyingOrigin'.
const rateTableRules = (prefix, lineKeys) => [
  body(prefix).optional().isObject().withMessage(`${prefix} must be an object`),
  ...lineKeys.flatMap((key) =>
    RATE_LINE_FIELDS.map((field) =>
      body(`${prefix}.${key}.${field}`).optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage(`${key} ${field} must be a positive number`)
    )
  ),
  ...lineKeys.map((key) => body(`${prefix}.${key}.currency`).optional().trim()),
  body(`${prefix}.hidden`).optional().isArray().withMessage(`${prefix}.hidden must be a list`),
  body(`${prefix}.hidden.*`).isIn(lineKeys).withMessage('Unknown charge line'),
  body(`${prefix}.custom`).optional().isArray(),
  body(`${prefix}.custom.*.currency`).optional().trim(),
  body(`${prefix}.custom.*.uid`).optional().trim(),
  body(`${prefix}.custom.*.label`).optional().trim().notEmpty().withMessage('Custom charge label is required'),
  ...RATE_LINE_FIELDS.map((field) =>
    body(`${prefix}.custom.*.${field}`).optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage(`Custom charge ${field} must be a positive number`)
  ),
]

const dangerousGoodsRules = [
  body('isDangerous').optional().isBoolean().withMessage('isDangerous must be true or false').toBoolean(),
  body('unNumber').custom((value, { req }) => {
    const isDangerous = req.body.isDangerous === true || req.body.isDangerous === 'true'
    if (isDangerous && !(value && value.trim())) throw new Error('UN Number is required when cargo is marked dangerous')
    return true
  }),
]

const sharedOptionalRules = [
  body('customer').optional({ checkFalsy: true }).isMongoId().withMessage('Valid customer ID required'),
  body('contactPerson').optional().trim(),
  body('contactPhone').optional().trim(),
  body('contactEmail').optional({ checkFalsy: true }).isEmail().withMessage('Invalid contact email'),
  body('clientReferenceNo').optional().trim(),
  body('inquiryDate').optional().isISO8601().withMessage('Invalid inquiry date'),
  body('salesRep').optional().trim(),
  body('hsCode').optional().trim(),
  body('grossWeight').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Gross weight must be a positive number'),
  body('cbm').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('CBM must be a positive number'),
  body('incoterms').optional({ checkFalsy: true }).isIn(['EXW', 'FCA', 'FOB', 'CPT', 'CIP', 'CFR', 'CIF', 'DAP', 'DPU', 'DDP']).withMessage('Invalid incoterms'),
  body('targetEtd').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid target ETD'),
  body('targetRate').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Target rate must be a positive number'),
  body('cargoReadinessDate').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid cargo readiness date'),
  body('specialNotes').optional().trim(),
  body('nvocc').optional({ checkFalsy: true }).isMongoId().withMessage('Valid NVOCC ID required'),

  body('rateValidFrom').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid rate validity from date'),
  body('rateValidTo').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid rate validity to date'),
  ...rateTableRules('buyingOrigin', ORIGIN_LINE_KEYS),
  ...rateTableRules('buyingDestination', DESTINATION_LINE_KEYS),
  body('freeTimeBuyingDays').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('rateSourceReference').optional().trim(),

  ...rateTableRules('sellingOrigin', ORIGIN_LINE_KEYS),
  ...rateTableRules('sellingDestination', DESTINATION_LINE_KEYS),
  body('paymentTerms').optional({ checkFalsy: true }).isIn(['Freight Prepaid', 'Freight Collect']).withMessage('Invalid payment terms'),
]

export const createQuotationRules = [
  body('customerType').isIn(['new', 'existing']).withMessage('Client type must be new or existing'),
  body('clientName').trim().notEmpty().withMessage('Client name is required'),
  body('commodity').trim().notEmpty().withMessage('Commodity is required'),
  body('containers').isArray({ min: 1 }).withMessage('At least one container entry is required'),
  body('containers.*.containerType').isMongoId().withMessage('Valid containerType ID required'),
  body('containers.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('containers').custom(validateContainerEntries),
  body('pol').isMongoId().withMessage('Valid POL ID required'),
  body('pod').isMongoId().withMessage('Valid POD ID required'),
  ...dangerousGoodsRules,
  ...sharedOptionalRules,
]

export const updateQuotationRules = [
  body('customerType').optional().isIn(['new', 'existing']).withMessage('Client type must be new or existing'),
  body('clientName').optional().trim().notEmpty().withMessage('Client name cannot be empty'),
  body('commodity').optional().trim().notEmpty().withMessage('Commodity cannot be empty'),
  body('containers').optional().isArray({ min: 1 }).withMessage('At least one container entry is required'),
  body('containers.*.containerType').optional().isMongoId().withMessage('Valid containerType ID required'),
  body('containers.*.quantity').optional().isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('containers').optional().custom(validateContainerEntries),
  body('pol').optional().isMongoId().withMessage('Valid POL ID required'),
  body('pod').optional().isMongoId().withMessage('Valid POD ID required'),
  ...dangerousGoodsRules,
  ...sharedOptionalRules,
]

export const updateStatusRules = [
  body('status').isIn(['draft', 'sent', 'negotiation', 'approved', 'rejected']).withMessage('Invalid status'),
  body('rejectionReason').optional().trim(),
]
