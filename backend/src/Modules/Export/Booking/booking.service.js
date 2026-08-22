import fs from 'fs'
import path from 'path'
import mongoose from 'mongoose'
import Booking from './booking.model.js'
import { checkStock, decrementStock, incrementStock } from '../../MasterData/Container/container.service.js'
import ExcelJS from 'exceljs'

const POPULATE_FIELDS = [
  { path: 'pol', select: 'name code country' },
  { path: 'pod', select: 'name code country' },
  { path: 'containers.containerType', select: 'code label' },
  { path: 'carrier', select: 'name code' },
  { path: 'nvocc', select: 'name code' },
]

const BOOKING_STATUSES = ['pending', 'confirmed', 'cancelled']

// Escapes regex metacharacters so `search` can only ever match literal text —
// otherwise an unmatched "(" throws, and a crafted pattern risks ReDoS.
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Whitelists status/pol/pod instead of assigning req.query values straight
// into a Mongo filter — Express's qs parser turns `?pol[$ne]=x` into an
// object, which would otherwise flow into `.find()` as a query operator.
const buildBookingFilter = ({ status, pol, pod, search, searchFields = ['jobNo', 'clientName'] } = {}) => {
  const filter = {}
  if (status && BOOKING_STATUSES.includes(status)) filter.status = status
  if (pol && mongoose.Types.ObjectId.isValid(pol)) filter.pol = pol
  if (pod && mongoose.Types.ObjectId.isValid(pod)) filter.pod = pod
  if (search && typeof search === 'string') {
    const regex = { $regex: escapeRegex(search), $options: 'i' }
    filter.$or = searchFields.map((field) => ({ [field]: regex }))
  }
  return filter
}

// Dropping the dangerous-goods number whenever the flag is off is enforced
// here rather than trusted from the client, since the frontend only sends
// dangerousNumber while the toggle is on — leaving it simply absent (not
// explicitly cleared) would let a stale value from a prior edit survive.
const clearDangerousNumberIfNotDangerous = (booking) => {
  if (!booking.isDangerous) booking.dangerousNumber = undefined
}

// ─── Step 1: Create Booking ───────────────────────────────────────────────────
export const createBooking = async (data) => {
  const stockWarnings = []
  for (const entry of data.containers) {
    const { ok, available } = await checkStock(entry.containerType, entry.quantity)
    if (!ok) {
      stockWarnings.push({ containerTypeId: entry.containerType, requested: entry.quantity, available })
    }
  }
  const booking = new Booking(data)
  clearDangerousNumberIfNotDangerous(booking)
  await booking.save()
  await booking.populate(POPULATE_FIELDS)
  return { booking, stockWarnings }
}

// ─── Step 1: Update Client Quotation ──────────────────────────────────────────
export const updateStep1 = async (id, data) => {
  const booking = await Booking.findById(id)
  if (!booking) throw Object.assign(new Error('Booking not found'), { statusCode: 404 })
  if (booking.status === 'cancelled') {
    throw Object.assign(new Error('Cannot update a cancelled booking'), { statusCode: 400 })
  }

  const stockWarnings = []
  if (data.containers) {
    for (const entry of data.containers) {
      const { ok, available } = await checkStock(entry.containerType, entry.quantity)
      if (!ok) {
        stockWarnings.push({ containerTypeId: entry.containerType, requested: entry.quantity, available })
      }
    }
  }

  const step1Fields = [
    'clientName', 'clientPhone', 'clientEmail', 'pol', 'pod', 'containers', 'blNo',
    'commodity', 'ucrNumber', 'exportTaxNumber', 'importTaxNumber', 'importCountry',
    'packagesCount', 'vgm', 'isDangerous', 'dangerousNumber', 'shippingDeclaration',
  ]

  for (const field of step1Fields) {
    if (data[field] !== undefined) booking[field] = data[field]
  }
  clearDangerousNumberIfNotDangerous(booking)

  await booking.save()
  await booking.populate(POPULATE_FIELDS)
  return { booking, stockWarnings }
}

// ─── Step 2: Update Operational Details ──────────────────────────────────────
export const updateStep2 = async (id, data) => {
  const booking = await Booking.findById(id)
  if (!booking) throw Object.assign(new Error('Booking not found'), { statusCode: 404 })
  if (booking.status === 'cancelled') {
    throw Object.assign(new Error('Cannot update a cancelled booking'), { statusCode: 400 })
  }

  const step2Fields = [
    'nvocc', 'price', 'cost', 'freeTime',
    'gateInDate', 'gateOutDate', 'containerLocation',
    'shipper', 'consignee', 'etd', 'atd', 'eta', 'ata',
    'carrier', 'vesselName', 'voyageNo', 'polAgent', 'podAgent',
    'containers', 'manifestStatus', 'notes', 'blNo',
  ]

  for (const field of step2Fields) {
    if (data[field] !== undefined) booking[field] = data[field]
  }
  booking.step = 2

  await booking.save()
  await booking.populate(POPULATE_FIELDS)
  return booking
}

// ─── Confirm Booking ──────────────────────────────────────────────────────────
export const confirmBooking = async (id) => {
  const booking = await Booking.findById(id)
  if (!booking) throw Object.assign(new Error('Booking not found'), { statusCode: 404 })
  if (booking.status !== 'pending') {
    throw Object.assign(new Error(`Cannot confirm a booking with status: ${booking.status}`), { statusCode: 400 })
  }

  booking.status = 'confirmed'
  await booking.save()

  // Decrement stock for each container type, scoped to this booking's NVOCC
  // so allocation never draws down a different NVOCC's physical containers
  for (const entry of booking.containers) {
    try {
      await decrementStock(entry.containerType, entry.quantity, booking.nvocc)
    } catch (_) {
      // log but don't fail — stock may not be tracked for all types
    }
  }

  await booking.populate(POPULATE_FIELDS)
  return booking
}

// ─── Cancel Booking ───────────────────────────────────────────────────────────
export const cancelBooking = async (id) => {
  const booking = await Booking.findById(id)
  if (!booking) throw Object.assign(new Error('Booking not found'), { statusCode: 404 })
  if (booking.status === 'cancelled') {
    throw Object.assign(new Error('Booking is already cancelled'), { statusCode: 400 })
  }

  const wasConfirmed = booking.status === 'confirmed'
  booking.status = 'cancelled'
  await booking.save()

  // Restore stock if it was previously confirmed, scoped to the same NVOCC
  // that decrementStock allocated it against on confirm
  if (wasConfirmed) {
    for (const entry of booking.containers) {
      try {
        await incrementStock(entry.containerType, entry.quantity, booking.nvocc)
      } catch (_) {}
    }
  }

  await booking.populate(POPULATE_FIELDS)
  return booking
}

// ─── Delete Booking ───────────────────────────────────────────────────────────
export const deleteBooking = async (id) => {
  const booking = await Booking.findById(id)
  if (!booking) throw Object.assign(new Error('Booking not found'), { statusCode: 404 })
  if (booking.status === 'confirmed') {
    throw Object.assign(new Error('Cancel the booking before deleting it'), { statusCode: 400 })
  }

  if (booking.shippingDeclaration?.filePath) {
    const filePath = path.join(process.cwd(), 'uploads', 'shipping-declarations', booking.shippingDeclaration.filePath)
    fs.unlink(filePath, () => {}) // best-effort cleanup — a missing file must not block deletion
  }

  await booking.deleteOne()
  return booking
}

// ─── Get Bookings (paginated) ─────────────────────────────────────────────────
export const getBookings = async ({ page = 1, limit = 20, status, pol, pod, search } = {}) => {
  const filter = buildBookingFilter({ status, pol, pod, search, searchFields: ['jobNo', 'clientName', 'blNo'] })

  const skip = (Number(page) - 1) * Number(limit)
  const total = await Booking.countDocuments(filter)
  const bookings = await Booking.find(filter)
    .populate(POPULATE_FIELDS)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))

  return { bookings, total, page: Number(page), pages: Math.ceil(total / Number(limit)) }
}

// ─── Get Single Booking ───────────────────────────────────────────────────────
export const getBookingById = async (id) => {
  const booking = await Booking.findById(id).populate(POPULATE_FIELDS)
  if (!booking) throw Object.assign(new Error('Booking not found'), { statusCode: 404 })
  return booking
}

// ─── Preview / Aggregation ────────────────────────────────────────────────────
export const getPreviewData = async ({ status, pol, pod, search } = {}) => {
  const matchStage = buildBookingFilter({ status, pol, pod, search })

  // Get bookings with full populate for table rows
  const bookings = await Booking.find(matchStage)
    .populate(POPULATE_FIELDS)
    .sort({ createdAt: -1 })

  // Build summary from populated data
  const containerTotals = {}
  const polTotals = {}
  const podTotals = {}

  for (const b of bookings) {
    // Container totals
    for (const entry of b.containers) {
      const code = entry.containerType?.code || 'UNKNOWN'
      containerTotals[code] = (containerTotals[code] || 0) + entry.quantity
    }
    // POL totals
    const polCode = b.pol?.code || 'UNKNOWN'
    polTotals[polCode] = (polTotals[polCode] || 0) + 1
    // POD totals
    const podCode = b.pod?.code || 'UNKNOWN'
    podTotals[podCode] = (podTotals[podCode] || 0) + 1
  }

  // Format table rows
  const rows = bookings.map((b) => ({
    _id: b._id,
    jobNo: b.jobNo,
    clientName: b.clientName,
    pol: b.pol ? `${b.pol.code} — ${b.pol.name}` : '-',
    pod: b.pod ? `${b.pod.code} — ${b.pod.name}` : '-',
    containersSummary: b.containers
      .map((e) => `${e.containerType?.code || '?'} x${e.quantity}`)
      .join(', '),
    blNo: b.blNo || '-',
    shipper: b.shipper?.name || '-',
    consignee: b.consignee?.name || '-',
    vessel: b.vesselName || '-',
    voyageNo: b.voyageNo || '-',
    etd: b.etd || null,
    eta: b.eta || null,
    step: b.step,
    status: b.status,
    manifestStatus: b.manifestStatus,
  }))

  return { summary: { containerTotals, polTotals, podTotals }, bookings: rows }
}

// ─── Excel Export ─────────────────────────────────────────────────────────────
export const generateExcel = async ({ status, pol, pod, search } = {}) => {
  const filter = buildBookingFilter({ status, pol, pod, search })

  const bookings = await Booking.find(filter).populate(POPULATE_FIELDS).sort({ createdAt: -1 })

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'NVOCC System'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Export Bookings')

  const headerStyle = {
    font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e3a5f' } },
    alignment: { vertical: 'middle', horizontal: 'center' },
    border: {
      bottom: { style: 'thin', color: { argb: 'FFf59e0b' } },
    },
  }

  const columns = [
    { header: 'Job No', key: 'jobNo', width: 14 },
    { header: 'Client Name', key: 'clientName', width: 22 },
    { header: 'POL', key: 'pol', width: 20 },
    { header: 'POD', key: 'pod', width: 20 },
    { header: 'Containers', key: 'containers', width: 28 },
    { header: 'B/L No', key: 'blNo', width: 16 },
    { header: 'Shipper', key: 'shipper', width: 22 },
    { header: 'Consignee', key: 'consignee', width: 22 },
    { header: 'Vessel', key: 'vessel', width: 18 },
    { header: 'Voyage No', key: 'voyageNo', width: 14 },
    { header: 'ETD', key: 'etd', width: 14 },
    { header: 'ETA', key: 'eta', width: 14 },
    { header: 'Gate In', key: 'gateInDate', width: 14 },
    { header: 'Gate Out', key: 'gateOutDate', width: 14 },
    { header: 'Manifest Status', key: 'manifestStatus', width: 16 },
    { header: 'Price', key: 'price', width: 12 },
    { header: 'Cost', key: 'cost', width: 12 },
    { header: 'Step', key: 'step', width: 10 },
    { header: 'Status', key: 'status', width: 12 },
  ]

  sheet.columns = columns

  // Style header row
  const headerRow = sheet.getRow(1)
  headerRow.height = 28
  columns.forEach((_, i) => {
    const cell = headerRow.getCell(i + 1)
    Object.assign(cell, headerStyle)
    cell.font = headerStyle.font
    cell.fill = headerStyle.fill
    cell.alignment = headerStyle.alignment
    cell.border = headerStyle.border
  })

  const fmtDate = (d) => (d ? new Date(d).toISOString().split('T')[0] : '')

  for (const b of bookings) {
    sheet.addRow({
      jobNo: b.jobNo,
      clientName: b.clientName,
      pol: b.pol ? `${b.pol.code} — ${b.pol.name}` : '',
      pod: b.pod ? `${b.pod.code} — ${b.pod.name}` : '',
      containers: b.containers.map((e) => `${e.containerType?.code || '?'} x${e.quantity}`).join(', '),
      blNo: b.blNo || '',
      shipper: b.shipper?.name || '',
      consignee: b.consignee?.name || '',
      vessel: b.vesselName || '',
      voyageNo: b.voyageNo || '',
      etd: fmtDate(b.etd),
      eta: fmtDate(b.eta),
      gateInDate: fmtDate(b.gateInDate),
      gateOutDate: fmtDate(b.gateOutDate),
      manifestStatus: b.manifestStatus || '',
      price: b.price ?? '',
      cost: b.cost ?? '',
      step: b.step,
      status: b.status,
    })
  }

  // Alternate row shading
  sheet.eachRow((row, rowNum) => {
    if (rowNum > 1 && rowNum % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
      })
    }
  })

  return workbook
}
