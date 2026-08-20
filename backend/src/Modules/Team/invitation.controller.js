import { validationResult } from 'express-validator'
import * as service from './team.service.js'
import { logAction, getRequestMeta } from '../AuditLog/auditLog.service.js'

export const getInvitationByToken = async (req, res, next) => {
  try {
    const invitation = await service.getInvitationByToken(req.params.token)
    res.json({
      success: true,
      data: {
        email: invitation.email,
        roleName: invitation.role.name,
        invitedByName: invitation.invitedBy?.name || invitation.invitedBy?.email,
        expiresAt: invitation.expiresAt,
      },
    })
  } catch (err) { next(err) }
}

export const acceptInvitation = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })

    const user = await service.acceptInvitation(req.params.token, req.body)
    await logAction({
      user, action: 'ACCEPT_INVITE', resource: 'Invitation', resourceId: user._id,
      description: `${user.email} accepted their invitation`, result: 'SUCCESS', ...getRequestMeta(req),
    })
    res.json({ success: true, data: user })
  } catch (err) { next(err) }
}

export const refuseInvitation = async (req, res, next) => {
  try {
    const invitation = await service.refuseInvitation(req.params.token)
    await logAction({
      action: 'REFUSE_INVITE', resource: 'Invitation', resourceId: invitation._id,
      description: `${invitation.email} refused their invitation`, result: 'SUCCESS', ...getRequestMeta(req),
    })
    res.json({ success: true, message: 'Invitation refused' })
  } catch (err) { next(err) }
}
