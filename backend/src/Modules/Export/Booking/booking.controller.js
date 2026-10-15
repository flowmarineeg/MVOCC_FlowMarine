import path from 'path'
import { validationResult } from 'express-validator'
import * as service from './booking.service.js'
import { logAction, getRequestMeta } from '../../AuditLog/auditLog.service.js'
import { assertConvertible, markConverted } from '../Quotation/quotation.service.js'
import * as actions from './booking.actions.js'
import { buildJobState, computeReconciliation, loadContext } from './booking.steps.js'
import { buildLoadingListWorkbook, buildDgManifestPdf, buildHblPdf } from './booking.docs.js'
import Booking from './booking.model.js'

// Sprint 007 — every booking / B&L response also carries the computed job state
// (per-step issues, warnings, reconciliation, lifecycle stage) next to `data`.
const stateOf = async (id) => buildJobState(id)
const audit = (req, action, booking, description) =>
  logAction({ user: req.user, action, resource: 'Booking', resourceId: booking.jobNo, description, result: 'SUCCESS', ...getRequestMeta(req) })

// shippingDeclaration/bookingConfirmationFile/customsCertificateFile must
// only ever come from an actual uploaded file — never from the JSON body,
// or a client could plant an arbitrary filePath (e.g. "../../../.env") that
// the download routes would later read. `files` is req.files (from
// .fields()) when present.
const FILE_FIELDS = ['shippingDeclaration', 'bookingConfirmationFile', 'customsCertificateFile']

const applyUploadedFiles = (payload, files) => {
  for (const field of FILE_FIELDS) {
    delete payload[field]
    const file = files?.[field]?.[0]
    if (file) {
      payload[field] = {
        fileName: file.originalname,
        filePath: file.filename,
        mimeType: file.mimetype,
        uploadedAt: new Date(),
      }
    }
  }
}

export const createBooking = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
    const payload = { ...req.body }
    delete payload.jobNo // server-generated — see getNextJobNo() in booking.service.js
    applyUploadedFiles(payload, req.files)

    // Checked before the booking is created so an ineligible quotation
    // (not approved / already converted) never leaves an orphaned Booking
    // behind — then re-checked and committed by markConverted() below.
    if (payload.quotation) {
      await assertConvertible(payload.quotation)
    }

    const { booking, stockWarnings } = await service.createBooking(payload, req.user)

    if (payload.quotation) {
      await markConverted(payload.quotation, booking._id)
    }

    res.status(201).json({
      success: true,
      data: booking,
      state: await stateOf(booking._id),
      ...(stockWarnings.length > 0 && {
        warnings: { message: 'Some container quantities exceed available stock', details: stockWarnings },
      }),
    })
  } catch (err) { next(err) }
}

export const getBookings = async (req, res, next) => {
  try {
    const { page, limit, status, pol, pod, search } = req.query
    const result = await service.getBookings({ page, limit, status, pol, pod, search })
    res.json({ success: true, ...result })
  } catch (err) { next(err) }
}

export const getBookingById = async (req, res, next) => {
  try {
    const booking = await service.getBookingById(req.params.id)
    res.json({ success: true, data: booking, state: await stateOf(booking._id) })
  } catch (err) { next(err) }
}

export const getAttachment = async (req, res, next) => {
  try {
    const booking = await service.getBookingById(req.params.id)
    if (!booking.shippingDeclaration?.filePath) {
      return res.status(404).json({ success: false, message: 'No shipping declaration attached to this booking' })
    }
    // path.basename strips any directory components as defense in depth —
    // filePath should only ever be a bare, server-generated filename anyway.
    const filePath = path.join(process.cwd(), 'uploads', 'shipping-declarations', path.basename(booking.shippingDeclaration.filePath))
    res.download(filePath, booking.shippingDeclaration.fileName)
  } catch (err) { next(err) }
}

export const getConfirmationFile = async (req, res, next) => {
  try {
    const booking = await service.getBookingById(req.params.id)
    if (!booking.bookingConfirmationFile?.filePath) {
      return res.status(404).json({ success: false, message: 'No booking confirmation file attached to this booking' })
    }
    const filePath = path.join(process.cwd(), 'uploads', 'booking-confirmations', path.basename(booking.bookingConfirmationFile.filePath))
    res.download(filePath, booking.bookingConfirmationFile.fileName)
  } catch (err) { next(err) }
}

export const getBlJobs = async (req, res, next) => {
  try {
    const { page, limit, search } = req.query
    const result = await service.getBlJobs({ page, limit, search })
    res.json({ success: true, ...result })
  } catch (err) { next(err) }
}

export const getBlById = async (req, res, next) => {
  try {
    const booking = await service.getBlById(req.params.id)
    res.json({ success: true, data: booking, state: await stateOf(booking._id) })
  } catch (err) { next(err) }
}

export const updateBl = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
    const payload = { ...req.body }
    applyUploadedFiles(payload, req.files)
    const booking = await service.updateBl(req.params.id, payload)
    res.json({ success: true, data: booking, state: await stateOf(booking._id) })
  } catch (err) { next(err) }
}

export const getCustomsCertificateFile = async (req, res, next) => {
  try {
    const booking = await service.getBlById(req.params.id)
    if (!booking.customsCertificateFile?.filePath) {
      return res.status(404).json({ success: false, message: 'No customs certificate attached to this job' })
    }
    const filePath = path.join(process.cwd(), 'uploads', 'customs-certificates', path.basename(booking.customsCertificateFile.filePath))
    res.download(filePath, booking.customsCertificateFile.fileName)
  } catch (err) { next(err) }
}

export const updateBooking = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
    const payload = { ...req.body }
    applyUploadedFiles(payload, req.files)
    const { booking, stockWarnings } = await service.updateBooking(req.params.id, payload)
    res.json({
      success: true,
      data: booking,
      state: await stateOf(booking._id),
      ...(stockWarnings.length > 0 && {
        warnings: { message: 'Some container quantities exceed available stock', details: stockWarnings },
      }),
    })
  } catch (err) { next(err) }
}

export const confirmBooking = async (req, res, next) => {
  try {
    const booking = await service.confirmBooking(req.params.id)
    await logAction({
      user: req.user, action: 'CONFIRM', resource: 'Booking', resourceId: booking.jobNo,
      description: `Confirmed booking ${booking.jobNo}`, result: 'SUCCESS', ...getRequestMeta(req),
    })
    res.json({ success: true, data: booking, state: await stateOf(booking._id) })
  } catch (err) { next(err) }
}

export const cancelBooking = async (req, res, next) => {
  try {
    const booking = await service.cancelBooking(req.params.id)
    await logAction({
      user: req.user, action: 'CANCEL', resource: 'Booking', resourceId: booking.jobNo,
      description: `Cancelled booking ${booking.jobNo}`, result: 'SUCCESS', ...getRequestMeta(req),
    })
    res.json({ success: true, data: booking, state: await stateOf(booking._id) })
  } catch (err) { next(err) }
}

export const deleteBooking = async (req, res, next) => {
  try {
    const booking = await service.deleteBooking(req.params.id)
    await logAction({
      user: req.user, action: 'DELETE', resource: 'Booking', resourceId: booking.jobNo,
      description: `Deleted booking ${booking.jobNo}`, result: 'SUCCESS', ...getRequestMeta(req),
    })
    res.json({ success: true, message: 'Booking deleted' })
  } catch (err) { next(err) }
}

export const getPreview = async (req, res, next) => {
  try {
    const { status, pol, pod, search } = req.query
    const result = await service.getPreviewData({ status, pol, pod, search })
    res.json({ success: true, ...result })
  } catch (err) { next(err) }
}

export const exportExcel = async (req, res, next) => {
  try {
    const { status, pol, pod, search } = req.query
    const workbook = await service.generateExcel({ status, pol, pod, search })
    const date = new Date().toISOString().split('T')[0]
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="export-bookings-${date}.xlsx"`)
    await workbook.xlsx.write(res)
    res.end()
  } catch (err) { next(err) }
}

export const getQuotationMsds = async (req, res, next) => {
  try {
    const file = await service.getQuotationMsdsFile(req.params.id, req.params.fileId)
    res.download(file.path, file.fileName)
  } catch (err) { next(err) }
}

// ─── Sprint 007 — step engine, Step 5 actions and documents ──────────────────
export const completeStep = async (req, res, next) => {
  try {
    const booking = await actions.completeStep(req.params.id, req.params.n, req.user)
    await audit(req, 'STEP_COMPLETE', booking, `Completed step ${req.params.n} of ${booking.jobNo}`)
    res.json({ success: true, data: booking, state: await stateOf(booking._id) })
  } catch (err) {
    if (err.issues) return res.status(err.statusCode || 400).json({ success: false, message: err.message, issues: err.issues })
    next(err)
  }
}

export const reopenStep = async (req, res, next) => {
  try {
    const booking = await actions.reopenStep(req.params.id, req.params.n, req.body?.reason, req.user)
    await audit(req, 'STEP_AMEND', booking, `Amended step ${req.params.n} of ${booking.jobNo}: ${String(req.body.reason).trim()}`)
    res.json({ success: true, data: booking, state: await stateOf(booking._id) })
  } catch (err) { next(err) }
}

export const rollBooking = async (req, res, next) => {
  try {
    const booking = await actions.rollBooking(req.params.id, req.body?.reason, req.user)
    await audit(req, 'ROLL', booking, `Rolled the VO booking of ${booking.jobNo}: ${String(req.body.reason).trim()}`)
    res.json({ success: true, data: booking, state: await stateOf(booking._id) })
  } catch (err) { next(err) }
}

export const getReconciliation = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' })
    const ctx = await loadContext(booking)
    res.json({ success: true, data: computeReconciliation(booking, ctx.units) })
  } catch (err) { next(err) }
}

export const generateDraft = async (req, res, next) => {
  try {
    const booking = await actions.generateDraft(req.params.id, req.user, req.body?.note)
    await audit(req, 'BL_DRAFT', booking, `Generated draft B/L ${booking.blDraftVersion} for ${booking.jobNo}`)
    res.json({ success: true, data: booking, state: await stateOf(booking._id) })
  } catch (err) { next(err) }
}

export const issueHbl = async (req, res, next) => {
  try {
    const booking = await actions.issueHbl(req.params.id, req.user)
    await audit(req, 'HBL_ISSUE', booking, `Issued HBL ${booking.hblNumber} (version ${booking.hblVersion}) for ${booking.jobNo}`)
    res.json({ success: true, data: booking, state: await stateOf(booking._id) })
  } catch (err) {
    if (err.issues) return res.status(err.statusCode || 400).json({ success: false, message: err.message, issues: err.issues })
    next(err)
  }
}

export const reissueHbl = async (req, res, next) => {
  try {
    const booking = await actions.reissueHbl(req.params.id, req.body?.reason, req.user)
    await audit(req, 'HBL_REISSUE', booking, `Re-opened HBL ${booking.hblNumber} of ${booking.jobNo} for re-issue: ${String(req.body.reason).trim()}`)
    res.json({ success: true, data: booking, state: await stateOf(booking._id) })
  } catch (err) { next(err) }
}

export const sendPreAlert = async (req, res, next) => {
  try {
    const booking = await actions.sendPreAlert(req.params.id, req.user)
    const last = booking.preAlerts[booking.preAlerts.length - 1]
    await audit(req, 'PRE_ALERT', booking, `Sent the pre-alert for ${booking.jobNo} to ${last.recipients.join(', ')}`)
    res.json({ success: true, data: booking, state: await stateOf(booking._id) })
  } catch (err) { next(err) }
}

export const ackPreAlert = async (req, res, next) => {
  try {
    const booking = await actions.ackPreAlert(req.params.id)
    await audit(req, 'PRE_ALERT_ACK', booking, `Pre-alert of ${booking.jobNo} acknowledged`)
    res.json({ success: true, data: booking, state: await stateOf(booking._id) })
  } catch (err) { next(err) }
}

export const getActionStates = async (req, res, next) => {
  try {
    res.json({ success: true, data: await actions.getActionStates(req.params.id) })
  } catch (err) { next(err) }
}

const sendPdf = (res, doc, filename) => {
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  doc.pipe(res)
  doc.end()
}

const logDocument = async (booking, kind, user) => {
  const version = (booking.documents || []).filter((d) => d.kind === kind).length + 1
  await Booking.updateOne({ _id: booking._id }, { $push: { documents: { kind, version, at: new Date(), by: user?._id || user?.id } } })
}

export const downloadLoadingList = async (req, res, next) => {
  try {
    const states = await actions.getActionStates(req.params.id)
    if (!states.loadingList.enabled) return res.status(400).json({ success: false, message: states.loadingList.reason })
    const { booking, units } = await actions.getDocumentData(req.params.id)
    await logDocument(booking, 'loading-list', req.user)
    const wb = buildLoadingListWorkbook(booking, units)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="loading-list-${booking.jobNo.replace(/[^A-Za-z0-9-]+/g, '_')}.xlsx"`)
    await wb.xlsx.write(res)
    res.end()
  } catch (err) { next(err) }
}

export const downloadDgManifest = async (req, res, next) => {
  try {
    const states = await actions.getActionStates(req.params.id)
    if (!states.dgManifest.enabled) return res.status(400).json({ success: false, message: states.dgManifest.reason })
    const { booking, units } = await actions.getDocumentData(req.params.id)
    await logDocument(booking, 'dg-manifest', req.user)
    sendPdf(res, buildDgManifestPdf(booking, units), `dg-manifest-${booking.jobNo.replace(/[^A-Za-z0-9-]+/g, '_')}.pdf`)
  } catch (err) { next(err) }
}

export const downloadHbl = async (req, res, next) => {
  try {
    const { booking, units } = await actions.getDocumentData(req.params.id)
    if (!booking.hblIssuedAt) return res.status(400).json({ success: false, message: 'The HBL has not been issued yet — use the draft B/L' })
    sendPdf(res, buildHblPdf(booking, units), `hbl-${booking.hblNumber}.pdf`)
  } catch (err) { next(err) }
}

export const downloadDraftHbl = async (req, res, next) => {
  try {
    const { booking, units } = await actions.getDocumentData(req.params.id)
    sendPdf(res, buildHblPdf(booking, units, { draft: true }), `draft-bl-${booking.jobNo.replace(/[^A-Za-z0-9-]+/g, '_')}.pdf`)
  } catch (err) { next(err) }
}
