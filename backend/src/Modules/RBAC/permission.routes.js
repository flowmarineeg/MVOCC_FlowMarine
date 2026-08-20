import { Router } from 'express'
import * as ctrl from './rbac.controller.js'
import { authenticate, authorize } from '../../Middleware/auth.middleware.js'

const router = Router()
router.use(authenticate)

router.get('/', authorize('role:read'), ctrl.getPermissions)

export default router
