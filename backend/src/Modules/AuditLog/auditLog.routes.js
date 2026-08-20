import { Router } from 'express'
import * as ctrl from './auditLog.controller.js'
import { listQueryRules } from './auditLog.validation.js'
import { authenticate, authorize } from '../../Middleware/auth.middleware.js'

const router = Router()
router.use(authenticate, authorize('auditLog:read'))

router.get('/', listQueryRules, ctrl.getAuditLogs)
router.get('/:id', ctrl.getAuditLogById)

export default router
