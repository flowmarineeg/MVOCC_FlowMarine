import { Router } from 'express'
import * as ctrl from './rbac.controller.js'
import { createRoleRules, updateRoleRules } from './rbac.validation.js'
import { authenticate, authorize } from '../../Middleware/auth.middleware.js'

const router = Router()
router.use(authenticate)

router.get('/', authorize('role:read'), ctrl.getAllRoles)
router.post('/', authorize('role:create'), createRoleRules, ctrl.createRole)
router.get('/:id', authorize('role:read'), ctrl.getRoleById)
router.put('/:id', authorize('role:update'), updateRoleRules, ctrl.updateRole)
router.delete('/:id', authorize('role:delete'), ctrl.deleteRole)

export default router
