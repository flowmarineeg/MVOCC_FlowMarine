import { Router } from 'express'
import * as ctrl from './team.controller.js'
import { inviteRules, updateMemberRoleRules } from './team.validation.js'
import { authenticate, authorize } from '../../Middleware/auth.middleware.js'

const router = Router()

router.post('/invite', authenticate, authorize('team:invite'), inviteRules, ctrl.invite)
router.get('/members', authenticate, authorize('team:read'), ctrl.getMembers)
router.get('/members/:id', authenticate, authorize('team:read'), ctrl.getMemberById)
router.put('/members/:id/role', authenticate, authorize('team:update'), updateMemberRoleRules, ctrl.updateMemberRole)
router.patch('/members/:id/deactivate', authenticate, authorize('team:update'), ctrl.deactivateMember)
router.patch('/members/:id/reactivate', authenticate, authorize('team:update'), ctrl.reactivateMember)
router.delete('/members/:id', authenticate, authorize('team:update'), ctrl.deleteMember)
router.get('/invitations', authenticate, authorize('team:read'), ctrl.getInvitations)
router.post('/invitations/:id/resend', authenticate, authorize('team:invite'), ctrl.resendInvitation)
router.delete('/invitations/:id', authenticate, authorize('team:invite'), ctrl.revokeInvitation)

export default router
