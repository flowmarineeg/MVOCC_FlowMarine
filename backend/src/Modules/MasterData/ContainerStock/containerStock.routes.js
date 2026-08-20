import { Router } from 'express'
import * as ctrl from './containerStock.controller.js'
import { updateRules } from './containerStock.validation.js'
import { authenticate, authorize } from '../../../Middleware/auth.middleware.js'

const router = Router()
router.use(authenticate)

router.get('/', authorize('masterData:read'), ctrl.getAll)
router.put('/:typeId', authorize('masterData:update'), updateRules, ctrl.update)

export default router
