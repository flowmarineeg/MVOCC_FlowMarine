import { validationResult } from 'express-validator'
import * as service from './rbac.service.js'
import { logAction, getRequestMeta } from '../AuditLog/auditLog.service.js'

export const getAllRoles = async (req, res, next) => {
  try {
    const data = await service.getAllRoles()
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export const getRoleById = async (req, res, next) => {
  try {
    const data = await service.getRoleById(req.params.id)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export const createRole = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })

    const data = await service.createRole(req.body)
    await logAction({
      user: req.user, action: 'CREATE', resource: 'Role', resourceId: data._id,
      description: `Created role "${data.name}"`, result: 'SUCCESS', ...getRequestMeta(req),
    })
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

export const updateRole = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })

    const data = await service.updateRole(req.params.id, req.body)
    await logAction({
      user: req.user, action: 'UPDATE', resource: 'Role', resourceId: data._id,
      description: `Updated role "${data.name}"`, result: 'SUCCESS', ...getRequestMeta(req),
    })
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export const deleteRole = async (req, res, next) => {
  try {
    const data = await service.deleteRole(req.params.id)
    await logAction({
      user: req.user, action: 'DELETE', resource: 'Role', resourceId: req.params.id,
      description: `Deleted role "${data.name}"`, result: 'SUCCESS', ...getRequestMeta(req),
    })
    res.json({ success: true, message: 'Role deleted' })
  } catch (err) {
    await logAction({
      user: req.user, action: 'DELETE', resource: 'Role', resourceId: req.params.id,
      description: `Blocked role delete: ${err.message}`, result: 'FAILURE', ...getRequestMeta(req),
    })
    next(err)
  }
}

export const getPermissions = async (req, res, next) => {
  try {
    res.json({ success: true, data: service.getPermissionsCatalog() })
  } catch (err) { next(err) }
}
