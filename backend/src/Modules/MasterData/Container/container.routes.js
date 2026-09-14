import { Router } from 'express'
import * as ctrl from './container.controller.js'
import { quickAddRules } from './container.validation.js'
import { authenticate, authorize } from '../../../Middleware/auth.middleware.js'
import { uploadContainerExcel } from '../../../Middleware/upload.middleware.js'

const router = Router()
router.use(authenticate)

router.get('/overview', authorize('masterData:read'), ctrl.getOverview)
router.get('/import-template', authorize('masterData:create'), ctrl.downloadTemplate)
router.get('/', authorize('masterData:read'), ctrl.getAll)
router.post('/import-preview', authorize('masterData:create'), uploadContainerExcel, ctrl.importPreview)
router.post('/import-commit', authorize('masterData:create'), ctrl.importCommit)
router.post('/quick-add', authorize('masterData:create'), quickAddRules, ctrl.quickAdd)
router.delete('/:id', authorize('masterData:update'), ctrl.remove)

export default router
