import Booking from './booking.model.js'
import { checkStock, decrementStock, incrementStock } from '../../MasterData/ContainerStock/containerStock.service.js'
import ExcelJS from 'exceljs'

const POPULATE_FIELDS = [
  { path: 'pol', select: 'name code country' },
  { path: 'pod', select: 'name code country' },
  { path: 'containers.containerType', select: 'code label' },
  { path: 'mainVessel', select: 'name code' },
  { path: 'polAgent', select: 'name type email phone' },
  { path: 'podAgent', select: 'name type email phone' },
]

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
    'price', 'cost', 'freeTimeEstimated', 'freeTimeFinal',
    'gateInDate', 'gateOutDate', 'containerLocation',
    'shipper', 'consignee', 'etd', 'atd', 'eta', 'ata',
    'mainVessel', 'voyageNo', 'polAgent', 'podAgent',
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

  // Decrement stock for each container type
  for (const entry of booking.containers) {
    try {
      await decrementStock(entry.containerType, entry.quantity)
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

  // Restore stock if it was previously confirmed
  if (wasConfirmed) {
    for (const entry of booking.containers) {
      try {
        await incrementStock(entry.containerType, entry.quantity)
      } catch (_) {}
    }
  }

  await booking.populate(POPULATE_FIELDS)
  return booking
}

// ─── Get Bookings (paginated) ─────────────────────────────────────────────────
export const getBookings = async ({ page = 1, limit = 20, status, pol, pod, search } = {}) => {
  const filter = {}
  if (status) filter.status = status
  if (pol) filter.pol = pol
  if (pod) filter.pod = pod
  if (search) {
    filter.$or = [
      { jobNo: { $regex: search, $options: 'i' } },
      { clientName: { $regex: search, $options: 'i' } },
      { blNo: { $regex: search, $options: 'i' } },
    ]
  }

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
  const matchStage = {}
  if (status) matchStage.status = status
  if (pol) matchStage.pol = new (await import('mongoose')).default.Types.ObjectId(pol)
  if (pod) matchStage.pod = new (await import('mongoose')).default.Types.ObjectId(pod)
  if (search) {
    matchStage.$or = [
      { jobNo: { $regex: search, $options: 'i' } },
      { clientName: { $regex: search, $options: 'i' } },
    ]
  }

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
    shipper: b.shipper || '-',
    consignee: b.consignee || '-',
    vessel: b.mainVessel?.name || '-',
    voyageNo: b.voyageNo || '-',
    etd: b.etd || null,
    eta: b.eta || null,
    status: b.status,
    manifestStatus: b.manifestStatus,
  }))

  return { summary: { containerTotals, polTotals, podTotals }, bookings: rows }
}

// ─── Excel Export ─────────────────────────────────────────────────────────────
export const generateExcel = async ({ status, pol, pod, search } = {}) => {
  const filter = {}
  if (status) filter.status = status
  if (pol) filter.pol = pol
  if (pod) filter.pod = pod
  if (search) {
    filter.$or = [
      { jobNo: { $regex: search, $options: 'i' } },
      { clientName: { $regex: search, $options: 'i' } },
    ]
  }

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
      shipper: b.shipper || '',
      consignee: b.consignee || '',
      vessel: b.mainVessel?.name || '',
      voyageNo: b.voyageNo || '',
      etd: fmtDate(b.etd),
      eta: fmtDate(b.eta),
      gateInDate: fmtDate(b.gateInDate),
      gateOutDate: fmtDate(b.gateOutDate),
      manifestStatus: b.manifestStatus || '',
      price: b.price ?? '',
      cost: b.cost ?? '',
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
