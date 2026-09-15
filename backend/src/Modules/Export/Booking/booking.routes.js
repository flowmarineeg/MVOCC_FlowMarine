import { Router } from 'express'
import * as ctrl from './booking.controller.js'
import { createBookingRules, updateBookingRules } from './booking.validation.js'
import { authenticate, authorize } from '../../../Middleware/auth.middleware.js'
import { uploadBookingFiles, verifyFileSignature } from '../../../Middleware/upload.middleware.js'
import { parseJsonFields } from '../../../Middleware/parseJsonFields.middleware.js'

const router = Router()
router.use(authenticate)

// Object-valued fields arrive JSON-stringified over multipart (FormData has
// no native nested-object encoding) — parsed back before validation runs.
const JSON_FIELDS = ['containers', 'shipper', 'consignee', 'polAgent', 'podAgent']

// Special routes BEFORE /:id to avoid conflicts
router.get('/preview', authorize('booking:export'), ctrl.getPreview)
router.get('/export-excel', authorize('booking:export'), ctrl.exportExcel)

router.post(
  '/',
  authorize('booking:create'),
  uploadBookingFiles,
  verifyFileSignature('shippingDeclaration'),
  verifyFileSignature('bookingConfirmationFile'),
  parseJsonFields(JSON_FIELDS),
  createBookingRules,
  ctrl.createBooking
)
router.get('/', authorize('booking:read'), ctrl.getBookings)
router.get('/:id/attachment', authorize('booking:read'), ctrl.getAttachment)
router.get('/:id/confirmation-file', authorize('booking:read'), ctrl.getConfirmationFile)
router.get('/:id', authorize('booking:read'), ctrl.getBookingById)
router.put(
  '/:id',
  authorize('booking:update'),
  uploadBookingFiles,
  verifyFileSignature('shippingDeclaration'),
  verifyFileSignature('bookingConfirmationFile'),
  parseJsonFields(JSON_FIELDS),
  updateBookingRules,
  ctrl.updateBooking
)
router.put('/:id/confirm', authorize('booking:update'), ctrl.confirmBooking)
router.put('/:id/cancel', authorize('booking:update'), ctrl.cancelBooking)
router.delete('/:id', authorize('booking:update'), ctrl.deleteBooking)

export default router
