import { Router } from 'express'
import * as ctrl from './customer.controller.js'
import { createRules, updateRules } from './customer.validation.js'
import { authenticate, authorize } from '../../../Middleware/auth.middleware.js'
import { uploadCustomerFile, verifyFileSignature } from '../../../Middleware/upload.middleware.js'

const router = Router()
router.use(authenticate)

router.get('/', authorize('masterData:read'), ctrl.getAll)
router.post('/', authorize('masterData:create'), createRules, ctrl.create)
router.put('/:id', authorize('masterData:update'), updateRules, ctrl.update)
router.post('/:id/files/:kind', authorize('masterData:update'), uploadCustomerFile, verifyFileSignature('customerFile'), ctrl.uploadCertificate)
router.get('/:id/files/:kind', authorize('masterData:read'), ctrl.downloadCertificate)
router.delete('/:id/files/:kind', authorize('masterData:update'), ctrl.deleteCertificate)
router.patch('/:id/toggle', authorize('masterData:update'), ctrl.toggle)
router.delete('/:id', authorize('masterData:update'), ctrl.remove)

export default router
