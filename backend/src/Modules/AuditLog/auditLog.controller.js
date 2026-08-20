import { validationResult } from 'express-validator'
import * as service from './auditLog.service.js'

export const getAuditLogs = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })

    const { user, action, resource, result, dateFrom, dateTo, page, limit } = req.query
    const data = await service.getAuditLogs({ user, action, resource, result, dateFrom, dateTo, page, limit })
    res.json({ success: true, ...data })
  } catch (err) { next(err) }
}

export const getAuditLogById = async (req, res, next) => {
  try {
    const data = await service.getAuditLogById(req.params.id)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}
