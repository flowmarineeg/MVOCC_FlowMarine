import { validationResult } from 'express-validator'
import * as service from './quotation.service.js'
import { logAction, getRequestMeta } from '../../AuditLog/auditLog.service.js'

export const createQuotation = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
    const quotation = await service.createQuotation(req.body, req.user)
    res.status(201).json({ success: true, data: quotation })
  } catch (err) { next(err) }
}

export const getQuotations = async (req, res, next) => {
  try {
    const { page, limit, status, search } = req.query
    const result = await service.getQuotations({ page, limit, status, search })
    res.json({ success: true, ...result })
  } catch (err) { next(err) }
}

export const getQuotationById = async (req, res, next) => {
  try {
    const quotation = await service.getQuotationById(req.params.id)
    res.json({ success: true, data: quotation })
  } catch (err) { next(err) }
}

export const updateQuotation = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
    const canOverride = !!req.user?.permissions?.includes('quotation:approve')
    const quotation = await service.updateQuotation(req.params.id, req.body, req.user, { canOverride })
    res.json({ success: true, data: quotation })
  } catch (err) { next(err) }
}

export const updateStatus = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
    const { status, rejectionReason } = req.body
    const canApprove = !!req.user?.permissions?.includes('quotation:approve')

    const { quotation } = await service.updateStatus(req.params.id, { status, rejectionReason }, { canApprove })
    const updated = await service.applyStatusChange(quotation, status, { rejectionReason, approvedByUserId: req.user.id, updatedByUserId: req.user.id })

    await logAction({
      user: req.user, action: status.toUpperCase(), resource: 'Quotation', resourceId: updated.quotationNo,
      description: `Quotation ${updated.quotationNo} moved to ${status}`, result: 'SUCCESS', ...getRequestMeta(req),
    })

    res.json({ success: true, data: updated })
  } catch (err) { next(err) }
}

export const suggestRate = async (req, res, next) => {
  try {
    const { nvocc } = req.query
    if (!nvocc) return res.json({ success: true, data: null })
    const suggestion = await service.suggestRateForNvocc(nvocc, req.query.excludeId)
    res.json({ success: true, data: suggestion })
  } catch (err) { next(err) }
}

export const uploadMsds = async (req, res, next) => {
  try {
    const files = req.files || []
    if (files.length === 0) return res.status(400).json({ success: false, message: 'Choose at least one PDF or image to upload' })
    const canOverride = !!req.user?.permissions?.includes('quotation:approve')
    const quotation = await service.addMsdsFiles(req.params.id, files, req.user, { canOverride })
    res.status(201).json({ success: true, data: quotation })
  } catch (err) { next(err) }
}

export const deleteMsds = async (req, res, next) => {
  try {
    const canOverride = !!req.user?.permissions?.includes('quotation:approve')
    const quotation = await service.removeMsdsFile(req.params.id, req.params.fileId, req.user, { canOverride })
    res.json({ success: true, data: quotation })
  } catch (err) { next(err) }
}

export const downloadMsds = async (req, res, next) => {
  try {
    const file = await service.getMsdsFile(req.params.id, req.params.fileId)
    res.download(file.path, file.fileName)
  } catch (err) { next(err) }
}
