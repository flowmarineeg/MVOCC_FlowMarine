import { Router } from 'express'
import * as ctrl from './booking.controller.js'
import { createBookingRules, updateStep1Rules, updateStep2Rules } from './booking.validation.js'
import { authenticate, authorize } from '../../../Middleware/auth.middleware.js'
import { uploadShippingDeclaration, verifyShippingDeclarationSignature } from '../../../Middleware/upload.middleware.js'
import { parseJsonFields } from '../../../Middleware/parseJsonFields.middleware.js'

const router = Router()
router.use(authenticate)

// Special routes BEFORE /:id to avoid conflicts
router.get('/preview', authorize('booking:export'), ctrl.getPreview)
router.get('/export-excel', authorize('booking:export'), ctrl.exportExcel)

router.post(
  '/',
  authorize('booking:create'),
  uploadShippingDeclaration,
  verifyShippingDeclarationSignature,
  parseJsonFields(['containers']),
  createBookingRules,
  ctrl.createBooking
)
router.get('/', authorize('booking:read'), ctrl.getBookings)
router.get('/:id/attachment', authorize('booking:read'), ctrl.getAttachment)
router.get('/:id', authorize('booking:read'), ctrl.getBookingById)
router.put(
  '/:id/step1',
  authorize('booking:update'),
  uploadShippingDeclaration,
  verifyShippingDeclarationSignature,
  parseJsonFields(['containers']),
  updateStep1Rules,
  ctrl.updateStep1
)
router.put('/:id/step2', authorize('booking:update'), updateStep2Rules, ctrl.updateStep2)
router.put('/:id/confirm', authorize('booking:update'), ctrl.confirmBooking)
router.put('/:id/cancel', authorize('booking:update'), ctrl.cancelBooking)
router.delete('/:id', authorize('booking:update'), ctrl.deleteBooking)

export default router
