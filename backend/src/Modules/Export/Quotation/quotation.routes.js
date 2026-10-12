import { Router } from 'express'
import * as ctrl from './quotation.controller.js'
import { createQuotationRules, updateQuotationRules, updateStatusRules } from './quotation.validation.js'
import { authenticate, authorize } from '../../../Middleware/auth.middleware.js'
import { uploadMsdsFiles, verifyMsdsSignatures } from '../../../Middleware/upload.middleware.js'

const router = Router()
router.use(authenticate)

// Before /:id to avoid conflicts
router.get('/suggest-rate', authorize('quotation:read'), ctrl.suggestRate)

router.post('/', authorize('quotation:create'), createQuotationRules, ctrl.createQuotation)
router.get('/', authorize('quotation:read'), ctrl.getQuotations)
router.get('/:id', authorize('quotation:read'), ctrl.getQuotationById)
router.put('/:id', authorize('quotation:update'), updateQuotationRules, ctrl.updateQuotation)
router.post('/:id/msds', authorize('quotation:update'), uploadMsdsFiles, verifyMsdsSignatures, ctrl.uploadMsds)
router.get('/:id/msds/:fileId', authorize('quotation:read'), ctrl.downloadMsds)
router.delete('/:id/msds/:fileId', authorize('quotation:update'), ctrl.deleteMsds)
router.put('/:id/status', authorize('quotation:update'), updateStatusRules, ctrl.updateStatus)

export default router
