import { validationResult } from 'express-validator'
import * as service from './booking.service.js'
import { logAction, getRequestMeta } from '../../AuditLog/auditLog.service.js'

export const createBooking = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
    const { booking, stockWarnings } = await service.createBooking(req.body)
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

export const updateStep2 = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
    const booking = await service.updateStep2(req.params.id, req.body)
    res.json({ success: true, data: booking })
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
