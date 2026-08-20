import { Router } from 'express'
import * as ctrl from './booking.controller.js'
import { createBookingRules, updateStep2Rules } from './booking.validation.js'
import { authenticate, authorize } from '../../../Middleware/auth.middleware.js'

const router = Router()
router.use(authenticate)

// Special routes BEFORE /:id to avoid conflicts
router.get('/preview', authorize('booking:export'), ctrl.getPreview)
router.get('/export-excel', authorize('booking:export'), ctrl.exportExcel)

router.post('/', authorize('booking:create'), createBookingRules, ctrl.createBooking)
router.get('/', authorize('booking:read'), ctrl.getBookings)
router.get('/:id', authorize('booking:read'), ctrl.getBookingById)
router.put('/:id/step2', authorize('booking:update'), updateStep2Rules, ctrl.updateStep2)
router.put('/:id/confirm', authorize('booking:update'), ctrl.confirmBooking)
router.put('/:id/cancel', authorize('booking:update'), ctrl.cancelBooking)

export default router
