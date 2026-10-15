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
// Permanent delete — reuses quotation:update (no new RBAC key); blocked while a job exists for it.
router.delete('/:id', authorize('quotation:update'), ctrl.deleteQuotation)
router.post('/:id/msds', authorize('quotation:update'), uploadMsdsFiles, verifyMsdsSignatures, ctrl.uploadMsds)
router.get('/:id/msds/:fileId', authorize('quotation:read'), ctrl.downloadMsds)
router.delete('/:id/msds/:fileId', authorize('quotation:update'), ctrl.deleteMsds)
router.post('/:id/revise', authorize('quotation:update'), ctrl.reviseQuotation)
router.post('/:id/duplicate', authorize('quotation:create'), ctrl.duplicateQuotation)
router.get('/:id/pdf', authorize('quotation:read'), ctrl.downloadPdf)
router.put('/:id/status', authorize('quotation:update'), updateStatusRules, ctrl.updateStatus)

export default router
