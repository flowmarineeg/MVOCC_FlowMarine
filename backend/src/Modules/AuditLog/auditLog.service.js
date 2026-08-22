import mongoose from 'mongoose'
import AuditLog from './auditLog.model.js'

const RESULT_VALUES = ['SUCCESS', 'FAILURE']

// A broken audit write must never break the parent request/response.
export const logAction = async ({ user, userEmail, action, resource, resourceId, description, result = 'SUCCESS', ip, userAgent, metadata }) => {
  try {
    await AuditLog.create({
      user: user?._id || user?.id || user || null,
      userEmail: userEmail || user?.email || null,
      action,
      resource,
      resourceId: resourceId ? String(resourceId) : null,
      description,
      result,
      ip,
      userAgent,
      metadata,
    })
  } catch (err) {
    console.error('⚠️  Failed to write audit log:', err.message)
  }
}

export const getRequestMeta = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') || null,
})

export const getAuditLogs = async ({ user, action, resource, result, dateFrom, dateTo, page = 1, limit = 20 } = {}) => {
  // Each value is validated/type-checked before assignment rather than
  // copied straight from req.query — otherwise `?user[$ne]=x` (an object,
  // courtesy of Express's bracket-syntax qs parser) would flow into the
  // filter as a live query operator instead of a plain equality match.
  const filter = {}
  if (user && mongoose.Types.ObjectId.isValid(user)) filter.user = user
  if (action && typeof action === 'string') filter.action = action.toUpperCase()
  if (resource && typeof resource === 'string') filter.resource = resource
  if (result && RESULT_VALUES.includes(result)) filter.result = result
  if (dateFrom || dateTo) {
    filter.createdAt = {}
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom)
    if (dateTo) filter.createdAt.$lte = new Date(dateTo)
  }

  const skip = (Number(page) - 1) * Number(limit)
  const total = await AuditLog.countDocuments(filter)
  const logs = await AuditLog.find(filter)
    .populate('user', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))

  return { logs, total, page: Number(page), pages: Math.ceil(total / Number(limit)) }
}

export const getAuditLogById = async (id) => {
  const log = await AuditLog.findById(id).populate('user', 'name email')
  if (!log) throw Object.assign(new Error('Audit log entry not found'), { statusCode: 404 })
  return log
}
