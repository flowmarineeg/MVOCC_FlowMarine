import { Router } from 'express'
import * as ctrl from './containerType.controller.js'
import { createRules, updateRules } from './containerType.validation.js'
import { authenticate, authorize } from '../../../Middleware/auth.middleware.js'

const router = Router()
router.use(authenticate)

router.get('/', authorize('masterData:read'), ctrl.getAll)
router.post('/', authorize('masterData:create'), createRules, ctrl.create)
router.put('/:id', authorize('masterData:update'), updateRules, ctrl.update)
router.patch('/:id/toggle', authorize('masterData:update'), ctrl.toggle)

export default router
