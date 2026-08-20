import { validationResult } from 'express-validator'
import * as service from './team.service.js'
import { logAction, getRequestMeta } from '../AuditLog/auditLog.service.js'

export const invite = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })

    try {
      const { user, invitation } = await service.inviteMember({ ...req.body, invitedBy: req.user.id })
      await logAction({
        user: req.user, action: 'INVITE', resource: 'Invitation', resourceId: invitation._id,
        description: `Invited ${user.email}`, result: 'SUCCESS', ...getRequestMeta(req),
      })
      res.status(201).json({ success: true, data: { user, invitation } })
    } catch (err) {
      await logAction({
        user: req.user, action: 'INVITE', resource: 'Invitation',
        description: `Failed to invite ${req.body.email}: ${err.message}`, result: 'FAILURE', ...getRequestMeta(req),
      })
      throw err
    }
  } catch (err) { next(err) }
}

export const getMembers = async (req, res, next) => {
  try {
    const { status, search, page, limit } = req.query
    const result = await service.listMembers({ status, search, page, limit })
    res.json({ success: true, ...result })
  } catch (err) { next(err) }
}

export const getMemberById = async (req, res, next) => {
  try {
    const data = await service.getMemberById(req.params.id)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export const updateMemberRole = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })

    const data = await service.updateMemberRole(req.params.id, req.body.roleId)
    await logAction({
      user: req.user, action: 'UPDATE', resource: 'User', resourceId: data._id,
      description: `Changed role for ${data.email}`, result: 'SUCCESS', ...getRequestMeta(req),
    })
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export const deactivateMember = async (req, res, next) => {
  try {
    const data = await service.deactivateMember(req.params.id, req.user.id)
    await logAction({
      user: req.user, action: 'UPDATE', resource: 'User', resourceId: data._id,
      description: `Deactivated ${data.email}`, result: 'SUCCESS', ...getRequestMeta(req),
    })
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export const reactivateMember = async (req, res, next) => {
  try {
    const data = await service.reactivateMember(req.params.id)
    await logAction({
      user: req.user, action: 'UPDATE', resource: 'User', resourceId: data._id,
      description: `Reactivated ${data.email}`, result: 'SUCCESS', ...getRequestMeta(req),
    })
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export const getInvitations = async (req, res, next) => {
  try {
    const { status, page, limit } = req.query
    const result = await service.listInvitations({ status, page, limit })
    res.json({ success: true, ...result })
  } catch (err) { next(err) }
}

export const resendInvitation = async (req, res, next) => {
  try {
    const data = await service.resendInvitation(req.params.id)
    await logAction({
      user: req.user, action: 'INVITE', resource: 'Invitation', resourceId: data._id,
      description: `Resent invitation to ${data.email}`, result: 'SUCCESS', ...getRequestMeta(req),
    })
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export const revokeInvitation = async (req, res, next) => {
  try {
    const data = await service.revokeInvitation(req.params.id)
    await logAction({
      user: req.user, action: 'REVOKE_INVITE', resource: 'Invitation', resourceId: data._id,
      description: `Revoked invitation to ${data.email}`, result: 'SUCCESS', ...getRequestMeta(req),
    })
    res.json({ success: true, message: 'Invitation revoked' })
  } catch (err) { next(err) }
}
