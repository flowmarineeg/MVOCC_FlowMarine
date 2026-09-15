import path from 'path'
import { validationResult } from 'express-validator'
import * as service from './booking.service.js'
import { logAction, getRequestMeta } from '../../AuditLog/auditLog.service.js'
import { assertConvertible, markConverted } from '../Quotation/quotation.service.js'

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
    res.json({ success: true, data: booking })
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
    res.json({ success: true, data: booking })
  } catch (err) { next(err) }
}

export const updateBl = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
    const payload = { ...req.body }
    applyUploadedFiles(payload, req.files)
    const booking = await service.updateBl(req.params.id, payload)
    res.json({ success: true, data: booking })
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
    res.json({ success: true, data: booking })
  } catch (err) { next(err) }
}

export const cancelBooking = async (req, res, next) => {
  try {
    const booking = await service.cancelBooking(req.params.id)
    await logAction({
      user: req.user, action: 'CANCEL', resource: 'Booking', resourceId: booking.jobNo,
      description: `Cancelled booking ${booking.jobNo}`, result: 'SUCCESS', ...getRequestMeta(req),
    })
    res.json({ success: true, data: booking })
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
