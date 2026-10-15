import { Router } from 'express'
import * as ctrl from './booking.controller.js'
import { createBookingRules, updateBookingRules, blUpdateRules } from './booking.validation.js'
import { authenticate, authorize } from '../../../Middleware/auth.middleware.js'
import { uploadBookingFiles, verifyFileSignature } from '../../../Middleware/upload.middleware.js'
import { parseJsonFields } from '../../../Middleware/parseJsonFields.middleware.js'

const router = Router()
router.use(authenticate)

// Object-valued fields arrive JSON-stringified over multipart (FormData has
// no native nested-object encoding) — parsed back before validation runs.
const JSON_FIELDS = ['containers', 'containerAssignments', 'confirmedEquipment', 'shipper', 'consignee', 'notify', 'polAgent', 'podAgent']

// Special routes BEFORE /:id to avoid conflicts
router.get('/preview', authorize('booking:export'), ctrl.getPreview)
router.get('/export-excel', authorize('booking:export'), ctrl.exportExcel)

// ─── B&L (Bill of Lading / documentation) — gated on bl:read/bl:update,
// independent of booking:read/booking:update, so a documentation-only role
// can use this tab without full Booking ops access. Field-limited response
// — see BL_PROJECTION in booking.service.js.
router.get('/bl', authorize('bl:read'), ctrl.getBlJobs)

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
router.get('/:id/msds/:fileId', authorize('booking:read'), ctrl.getQuotationMsds)
router.get('/:id/confirmation-file', authorize('booking:read'), ctrl.getConfirmationFile)
router.get('/:id/bl/customs-certificate-file', authorize('bl:read'), ctrl.getCustomsCertificateFile)
router.get('/:id/bl', authorize('bl:read'), ctrl.getBlById)

// ─── Sprint 007 — step engine, Step 5 actions and documents ────────────────────
// Steps 1-3 belong to the booking permissions, Steps 4-5 to the B&L permissions (no new RBAC keys).
const authorizeStep = (req, res, next) => authorize(Number(req.params.n) >= 4 ? 'bl:update' : 'booking:update')(req, res, next)
router.post('/:id/steps/:n/complete', authorizeStep, ctrl.completeStep)
router.post('/:id/steps/:n/reopen', authorizeStep, ctrl.reopenStep)
router.post('/:id/roll', authorize('booking:update'), ctrl.rollBooking)
router.get('/:id/reconciliation', authorize('booking:read'), ctrl.getReconciliation)
router.get('/:id/bl/actions', authorize('bl:read'), ctrl.getActionStates)
router.post('/:id/bl/draft', authorize('bl:update'), ctrl.generateDraft)
router.post('/:id/bl/issue', authorize('bl:update'), ctrl.issueHbl)
router.post('/:id/bl/reissue', authorize('bl:update'), ctrl.reissueHbl)
router.post('/:id/bl/pre-alert', authorize('bl:update'), ctrl.sendPreAlert)
router.post('/:id/bl/pre-alert/ack', authorize('bl:update'), ctrl.ackPreAlert)
router.get('/:id/bl/loading-list.xlsx', authorize('bl:read'), ctrl.downloadLoadingList)
router.get('/:id/bl/dg-manifest.pdf', authorize('bl:read'), ctrl.downloadDgManifest)
router.get('/:id/bl/hbl.pdf', authorize('bl:read'), ctrl.downloadHbl)
router.get('/:id/bl/draft.pdf', authorize('bl:read'), ctrl.downloadDraftHbl)
router.put(
  '/:id/bl',
  authorize('bl:update'),
  uploadBookingFiles,
  verifyFileSignature('customsCertificateFile'),
  parseJsonFields(['podAgentUpdateLog']),
  blUpdateRules,
  ctrl.updateBl
)
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
