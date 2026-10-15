import { validationResult } from 'express-validator'
import * as service from './quotation.service.js'
import { logAction, getRequestMeta } from '../../AuditLog/auditLog.service.js'
import { buildQuotationPdf } from './quotation.pdf.js'

// The response carries the current readiness list so the page can show what is
// still missing before the quotation can be sent / approved / converted.
const withReadiness = (quotation) => ({
  ...quotation.toJSON(),
  readinessIssues: service.getReadinessIssues(quotation),
  warnings: service.getWarnings(quotation),
})

export const createQuotation = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
    const quotation = await service.createQuotation(req.body, req.user)
    res.status(201).json({ success: true, data: withReadiness(quotation) })
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
    res.json({ success: true, data: withReadiness(quotation) })
  } catch (err) { next(err) }
}

export const updateQuotation = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
    const canOverride = !!req.user?.permissions?.includes('quotation:approve')
    const quotation = await service.updateQuotation(req.params.id, req.body, req.user, { canOverride })
    res.json({ success: true, data: withReadiness(quotation) })
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
    res.status(201).json({ success: true, data: withReadiness(quotation) })
  } catch (err) { next(err) }
}

export const deleteMsds = async (req, res, next) => {
  try {
    const canOverride = !!req.user?.permissions?.includes('quotation:approve')
    const quotation = await service.removeMsdsFile(req.params.id, req.params.fileId, req.user, { canOverride })
    res.json({ success: true, data: withReadiness(quotation) })
  } catch (err) { next(err) }
}

export const downloadMsds = async (req, res, next) => {
  try {
    const file = await service.getMsdsFile(req.params.id, req.params.fileId)
    res.download(file.path, file.fileName)
  } catch (err) { next(err) }
}

export const deleteQuotation = async (req, res, next) => {
  try {
    const deleted = await service.deleteQuotation(req.params.id)
    await logAction({
      user: req.user, action: 'DELETE', resource: 'Quotation', resourceId: deleted.quotationNo,
      description: `Quotation ${deleted.quotationNo} deleted`, result: 'SUCCESS', ...getRequestMeta(req),
    })
    res.json({ success: true, message: 'Quotation deleted' })
  } catch (err) { next(err) }
}

export const reviseQuotation = async (req, res, next) => {
  try {
    const revised = await service.reviseQuotation(req.params.id, req.user)
    await logAction({
      user: req.user, action: 'REVISE', resource: 'Quotation', resourceId: revised.quotationNo,
      description: `Quotation revised as ${revised.quotationNo}`, result: 'SUCCESS', ...getRequestMeta(req),
    })
    res.status(201).json({ success: true, data: withReadiness(revised) })
  } catch (err) { next(err) }
}

export const duplicateQuotation = async (req, res, next) => {
  try {
    const copy = await service.duplicateQuotation(req.params.id, req.user)
    await logAction({
      user: req.user, action: 'DUPLICATE', resource: 'Quotation', resourceId: copy.quotationNo,
      description: `Quotation duplicated as ${copy.quotationNo}`, result: 'SUCCESS', ...getRequestMeta(req),
    })
    res.status(201).json({ success: true, data: withReadiness(copy) })
  } catch (err) { next(err) }
}

// Client-facing PDF: selling side only (see quotation.pdf.js).
export const downloadPdf = async (req, res, next) => {
  try {
    const quotation = await service.getQuotationById(req.params.id)
    const qtyBySize = await service.getQtyBySize(quotation.containers)
    const doc = buildQuotationPdf(quotation, qtyBySize)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${quotation.quotationNo}.pdf"`)
    doc.pipe(res)
    doc.end()
  } catch (err) { next(err) }
}
