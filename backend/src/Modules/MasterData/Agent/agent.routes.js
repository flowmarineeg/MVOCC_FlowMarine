import { Router } from 'express'
import * as ctrl from './agent.controller.js'
import { createRules, updateRules } from './agent.validation.js'
import { authenticate, authorize } from '../../../Middleware/auth.middleware.js'

const router = Router()
router.use(authenticate)

router.get('/', authorize('masterData:read'), ctrl.getAll)
router.post('/', authorize('masterData:create'), createRules, ctrl.create)
router.put('/:id', authorize('masterData:update'), updateRules, ctrl.update)
router.patch('/:id/toggle', authorize('masterData:update'), ctrl.toggle)
router.delete('/:id', authorize('masterData:update'), ctrl.remove)

export default router
