import { body } from 'express-validator'
import mongoose from 'mongoose'
import ContainerType from '../../MasterData/ContainerType/containerType.model.js'

// Shared by both rule sets — express-validator's isMongoId() on
// containers.*.containerType only checks the format looks right, it never
// checks the referenced ContainerType actually exists (Mongoose doesn't
// existence-check a `ref` on save), and it doesn't catch the same type
// being listed twice in one booking.
const validateContainerEntries = async (containers) => {
  if (!Array.isArray(containers)) return true
  const ids = containers.map((c) => c?.containerType).filter(Boolean)
  const uniqueIds = new Set(ids.map(String))
  if (uniqueIds.size !== ids.length) {
    throw new Error('Each container type can only appear once per booking')
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

const dangerousGoodsRule = body('dangerousNumber').custom((value, { req }) => {
  const isDangerous = req.body.isDangerous === true || req.body.isDangerous === 'true'
  if (isDangerous && !(value && value.trim())) {
    throw new Error('Dangerous goods number is required when cargo is marked dangerous')
  }
  return true
})

// Every field the single unified Job form can submit, besides the always-
// required core (clientName/Phone/Email, containers, pol, pod, commodity)
// and jobNo (server-generated — see getNextJobNo() in booking.service.js,
// never accepted from the client). Shared between create and update since
// there's no more Step1/Step2 split.
const sharedOptionalRules = [
  body('blNo').optional().trim(),
  body('ucrNumber').optional().trim(),
  body('exportTaxNumber').optional().trim(),
  body('importTaxNumber').optional().trim(),
  body('importCountry').optional().trim(),
  body('packagesCount').optional({ checkFalsy: true }).isInt({ min: 0 }).withMessage('Number of packages must be a positive number'),
  body('vgm').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('VGM must be a positive number'),
  body('grossWeight').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Gross weight must be a positive number'),
  body('cbm').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('CBM must be a positive number'),
  body('hsCode').optional().trim(),
  body('packageType').optional().trim(),
  body('isDangerous').optional().isBoolean().withMessage('isDangerous must be true or false').toBoolean(),
  dangerousGoodsRule,

  body('jobStatus').optional({ checkFalsy: true }).isIn(['open', 'in_progress', 'completed', 'closed_invoiced']).withMessage('Invalid job status'),
  body('customsSubmitted').optional().isBoolean().withMessage('customsSubmitted must be true or false').toBoolean(),
  body('customsReferenceNo').optional().trim(),

  body('carrier').optional({ checkFalsy: true }).isMongoId().withMessage('Valid carrier ID required'),
  body('vesselName').optional().trim(),
  body('voyageNo').optional().trim(),
  body('etd').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid date for ETD'),
  body('atd').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid date for ATD'),
  body('eta').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid date for ETA'),
  body('ata').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid date for ATA'),
  body('spaceConfirmationStatus').optional({ checkFalsy: true }).isIn(['Requested', 'Confirmed', 'Rejected']).withMessage('Invalid space confirmation status'),
  body('carrierBookingRef').optional().trim(),
  body('voContactPerson').optional().trim(),
  body('siCutoff').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid SI cut-off date'),
  body('vgmCutoff').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid VGM cut-off date'),
  body('cyGateInCutoff').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid CY gate-in cut-off date'),
  body('bookingConfirmationStatus').optional({ checkFalsy: true }).isIn(['Not Issued', 'Issued']).withMessage('Invalid booking confirmation status'),

  body('depot').optional({ checkFalsy: true }).isMongoId().withMessage('Valid depot ID required'),
  body('gateInDate').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid date for gateInDate'),
  body('gateOutDate').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid date for gateOutDate'),
  body('containerLocation').optional().trim(),

  body('nvocc').optional({ checkFalsy: true }).isMongoId().withMessage('Valid NVOCC ID required'),
  body('currency').optional().trim(),
  body('price').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('cost').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Cost must be a positive number'),
  body('freeTime').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid date for freeTime'),

  body('shipper.name').optional().trim(),
  body('shipper.email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid shipper email'),
  body('shipper.phone1').optional().trim(),
  body('shipper.phone2').optional().trim(),
  body('shipper.address').optional().trim(),
  body('shipper.taxNumber').optional().trim(),
  body('consignee.name').optional().trim(),
  body('consignee.email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid consignee email'),
  body('consignee.phone1').optional().trim(),
  body('consignee.phone2').optional().trim(),
  body('consignee.address').optional().trim(),
  body('consignee.taxNumber').optional().trim(),

  body('polAgent.name').optional().trim(),
  body('polAgent.email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid POL agent email'),
  body('polAgent.phone').optional().trim(),
  body('polAgent.address').optional().trim(),
  body('podAgent.name').optional().trim(),
  body('podAgent.email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid POD agent email'),
  body('podAgent.phone').optional().trim(),
  body('podAgent.address').optional().trim(),

  body('manifestStatus').optional().isIn(['PENDING', 'SUBMITTED', 'CONFIRMED']).withMessage('Invalid manifest status'),
  body('notes').optional().trim(),
]

export const createBookingRules = [
  body('quotation').optional({ checkFalsy: true }).isMongoId().withMessage('Valid quotation ID required'),
  body('clientName').trim().notEmpty().withMessage('Client name is required'),
  body('clientPhone').trim().notEmpty().withMessage('Client phone is required'),
  body('clientEmail').trim().notEmpty().isEmail().withMessage('Valid client email is required'),
  body('containers').isArray({ min: 1 }).withMessage('At least one container entry is required'),
  body('containers.*.containerType').isMongoId().withMessage('Valid containerType ID required'),
  body('containers.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('containers').custom(validateContainerEntries),
  body('pol').isMongoId().withMessage('Valid POL ID required'),
  body('pod').isMongoId().withMessage('Valid POD ID required'),
  body('commodity').trim().notEmpty().withMessage('Commodity is required'),
  ...sharedOptionalRules,
]

export const updateBookingRules = [
  body('clientName').optional().trim().notEmpty().withMessage('Client name cannot be empty'),
  body('clientPhone').optional().trim().notEmpty().withMessage('Client phone cannot be empty'),
  body('clientEmail').optional().trim().isEmail().withMessage('Valid client email is required'),
  body('containers').optional().isArray({ min: 1 }).withMessage('At least one container entry is required'),
  body('containers.*.containerType').optional().isMongoId().withMessage('Valid containerType ID required'),
  body('containers.*.quantity').optional().isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('containers').optional().custom(validateContainerEntries),
  body('pol').optional().isMongoId().withMessage('Valid POL ID required'),
  body('pod').optional().isMongoId().withMessage('Valid POD ID required'),
  body('commodity').optional().trim().notEmpty().withMessage('Commodity cannot be empty'),
  ...sharedOptionalRules,
]
