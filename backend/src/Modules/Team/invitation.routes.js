import { Router } from 'express'
import * as ctrl from './invitation.controller.js'
import { acceptInvitationRules } from './team.validation.js'

const router = Router()

// Fully public — invitees aren't authenticated yet
router.get('/:token', ctrl.getInvitationByToken)
router.post('/:token/accept', acceptInvitationRules, ctrl.acceptInvitation)
router.post('/:token/refuse', ctrl.refuseInvitation)

export default router
