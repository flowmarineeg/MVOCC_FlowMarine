import fs from 'fs'
import path from 'path'
import mongoose from 'mongoose'
import Booking from './booking.model.js'
import Quotation from '../Quotation/quotation.model.js'
import JobCounter from './jobCounter.model.js'
import { checkStock, decrementStock, incrementStock, applySeals } from '../../MasterData/Container/container.service.js'
import { getMsdsFile } from '../Quotation/quotation.service.js'
import ExcelJS from 'exceljs'
import { assertNotLocked, BL_STEP_FIELDS, APPROVAL_FIELDS, isIssued } from './booking.steps.js'

const POPULATE_FIELDS = [
  { path: 'pol', select: 'name code country' },
  { path: 'pod', select: 'name code country' },
  { path: 'containers.containerType', select: 'code label' },
  { path: 'carrier', select: 'name code' },
  { path: 'nvocc', select: 'name code' },
  { path: 'depot', select: 'name code' },
  { path: 'jobOpenedBy', select: 'name email' },
  // what the Job form shows read-only from its quotation (DG attachments, free time, container lines)
  { path: 'quotation', select: 'quotationNo freeTimeBuyingDays detentionFreeTimeDays isDangerous unNumber paymentTerms grossWeight cbm commodity targetEtd msdsFiles._id msdsFiles.fileName' },
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

// Dropping the class / UN numbers whenever the flag is off is enforced here
// rather than trusted from the client, since the frontend only sends them
// while the toggle is on — leaving them simply absent (not explicitly
// cleared) would let a stale value from a prior edit survive.
const clearDangerousFieldsIfNotDangerous = (booking) => {
  if (!booking.isDangerous) {
    booking.dangerousClass = undefined
    booking.unNumber = undefined
    booking.properShippingName = undefined
    booking.subsidiaryRisk = undefined
    booking.packingGroup = undefined
    booking.flashPoint = undefined
    booking.marinePollutant = false
    booking.emergencyContact = undefined
    booking.dgCutoff = undefined
    booking.dgAcceptanceRef = undefined
  }
}

// The seal entries must belong to a container type on the booking and not
// outnumber its quantity. (Which physical units get which seal is decided at
// confirm — oldest free stock first.)
const assertAssignments = async (booking) => {
  const picks = booking.containerAssignments || []
  const wanted = new Map(booking.containers.map((c) => [String(c.containerType), c.quantity]))
  const perType = new Map()
  for (const p of picks) {
    const key = String(p.containerType)
    if (!wanted.has(key)) {
      throw Object.assign(new Error('A seal entry belongs to a container type that is not on this booking'), { statusCode: 400 })
    }
    perType.set(key, (perType.get(key) || 0) + 1)
    if (perType.get(key) > wanted.get(key)) {
      throw Object.assign(new Error('More seal entries than the quantity requested for that container type'), { statusCode: 400 })
    }
  }
}

// customsSubmittedAt is server-set the instant customsSubmitted flips
// false → true (and cleared back to null if it's ever toggled back off) —
// same "server decides, client value ignored" pattern as the dangerous-goods
// number above. `wasSubmitted` is the value before this update's field-copy
// loop ran.
const stampCustomsSubmittedAt = (booking, wasSubmitted) => {
  if (booking.customsSubmitted && !wasSubmitted) booking.customsSubmittedAt = new Date()
  else if (!booking.customsSubmitted) booking.customsSubmittedAt = null
}

// Atomic per-year sequence: "OPS Jobs {year} FLOW MARINE – NVOCC-{seq}".
// findOneAndUpdate($inc, upsert) means concurrent creates never collide —
// no read-then-write race.
const getNextJobNo = async () => {
  const year = new Date().getFullYear()
  const key = `job-${year}`
  const counter = await JobCounter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { upsert: true, new: true })
  return `OPS Jobs ${year} FLOW MARINE – NVOCC-${String(counter.seq).padStart(4, '0')}`
}

// Every field a Job form submission (create or the single unified update)
// may set directly. jobNo/jobOpenedBy/customsSubmittedAt/status are always
// server-controlled and never appear here; `quotation` is set once, only by
// the convert-to-job flow in booking.controller.js.
const EDITABLE_FIELDS = [
  'clientName', 'clientPhone', 'clientEmail', 'pol', 'pod', 'containers', 'blNo',
  'commodity', 'ucrNumber', 'exportTaxNumber', 'importTaxNumber', 'importCountry',
  'packagesCount', 'grossWeight', 'netWeight', 'hsCode', 'packageType',
  'isDangerous', 'dangerousClass', 'unNumber', 'shippingDeclaration',
  'jobStatus', 'customsSubmitted', 'customsReferenceNo',
  'carrier', 'vesselName', 'voyageNo', 'etd', 'atd', 'eta', 'ata',
  'spaceConfirmationStatus', 'carrierBookingRef', 'voContactPerson',
  'siCutoff', 'vgmCutoff', 'cyGateInCutoff',
  'bookingConfirmationStatus', 'bookingConfirmationFile',
  'depot', 'gateInDate', 'gateOutDate', 'containerLocation', 'containerAssignments',
  'nvocc', 'currency', 'price', 'cost', 'freeTime',
  'shipper', 'consignee', 'notify', 'notifySameAsConsignee', 'shipperParty', 'consigneeParty', 'notifyParty',
  'polAgent', 'podAgent', 'podAgentRef',
  'manifestStatus', 'notes',
  // Sprint 007 — Steps 1-3
  'cargoReadinessDate', 'proformaInvoiceNo', 'proformaInvoiceDate', 'acidNumber', 'cbm', 'shipperReference',
  'countryOfOrigin', 'exporterLicenceNo', 'stuffingLocationType', 'stuffingDate', 'specialInstructions',
  'weightVarianceReason', 'properShippingName', 'subsidiaryRisk', 'packingGroup', 'flashPoint', 'marinePollutant',
  'emergencyContact', 'setTemperature', 'ventilationHumidity', 'oogDimensions',
  'polTerminal', 'podTerminal', 'serviceLoopCode', 'vesselImo', 'cyOpeningCutoff', 'customsCutoff', 'dgCutoff',
  'bookingRequestSentAt', 'confirmedEquipment', 'dgAcceptanceRef', 'voFreeTimeDays',
  'croNumber', 'croIssueDate', 'croValidityDate', 'croIssuedBy', 'releasedTo', 'truckPlateDriver', 'reconciliationReason',
]

// Master-data picks that the form clears by sending an empty string.
const PICK_REF_FIELDS = ['shipperParty', 'consigneeParty', 'notifyParty', 'podAgentRef']

// ─── Create Booking (single-page create) ──────────────────────────────────────
export const createBooking = async (data, currentUser) => {
  const stockWarnings = []
  for (const entry of data.containers) {
    const { ok, available } = await checkStock(entry.containerType, entry.quantity)
    if (!ok) {
      stockWarnings.push({ containerTypeId: entry.containerType, requested: entry.quantity, available })
    }
  }

  PICK_REF_FIELDS.forEach((f) => { if (data[f] === '') delete data[f] })
  const jobNo = await getNextJobNo()
  const booking = new Booking({
    ...data,
    jobNo,
    jobOpenedBy: currentUser?._id || currentUser?.id,
  })
  clearDangerousFieldsIfNotDangerous(booking)
  stampCustomsSubmittedAt(booking, false)
  await assertAssignments(booking)
  await booking.save()
  await booking.populate(POPULATE_FIELDS)
  return { booking, stockWarnings }
}

// ─── Update Booking (single unified update — replaces the old Step1/Step2 split) ─
export const updateBooking = async (id, data) => {
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

  const wasCustomsSubmitted = booking.customsSubmitted
  for (const field of EDITABLE_FIELDS) {
    // once confirmed the units are reserved; the per-unit panel edits them from then on
    if (field === 'containerAssignments' && booking.status === 'confirmed') continue
    if (data[field] === '' && PICK_REF_FIELDS.includes(field)) booking[field] = null // cleared pick
    else if (data[field] !== undefined) booking[field] = data[field]
  }
  clearDangerousFieldsIfNotDangerous(booking)
  stampCustomsSubmittedAt(booking, wasCustomsSubmitted)
  await assertAssignments(booking)
  // G5 / BR-5.3 — a completed step (or an issued HBL) only accepts follow-up data
  assertNotLocked(booking, booking.modifiedPaths())

  await booking.save()
  await booking.populate(POPULATE_FIELDS)
  return { booking, stockWarnings }
}

// ─── B&L (Bill of Lading / documentation) sub-API ──────────────────────────────
// Deliberately field-limited (BL_PROJECTION) so a bl:read/bl:update-only role
// never sees the rest of a booking's ops data (price/cost/carrier/containers/
// depot/etc.) — see the bl:read/bl:update gating in booking.routes.js.
const BL_CONTEXT_FIELDS = [
  'jobNo', 'clientName', 'clientPhone', 'clientEmail', 'pol', 'pod',
  'shipper', 'consignee', 'exportTaxNumber', 'importTaxNumber', 'atd', 'eta', 'etd', 'ata',
  'jobStatus', 'quotation', 'createdAt', 'updatedAt', 'status',
  // Sprint 007 — Step 4/5 read-only context (everything the Final S/D and HBL blocks echo)
  'commodity', 'hsCode', 'packagesCount', 'packageType', 'grossWeight', 'netWeight', 'cbm', 'isDangerous', 'dangerousClass',
  'unNumber', 'properShippingName', 'vesselName', 'voyageNo', 'carrierBookingRef', 'siCutoff', 'vgmCutoff',
  'cyGateInCutoff', 'podAgent', 'notify', 'bookingConfirmationStatus', 'stepsCompleted', 'reconfirmSteps',
  'amendments', 'hblIssuedAt', 'hblVersion', 'hblHistory', 'blDrafts', 'preAlerts', 'documents',
]

const BL_EDITABLE_FIELDS = [
  'elHarkaRepName', 'exportCustomsDeclarationNo', 'certificateReceivedDate', 'customsCertificateFile',
  'hblNumber', 'mblNumber', 'notifyPartyName', 'notifyPartyAddress', 'destinationAgentDetails',
  'consigneeToOrder', 'blDraftVersion', 'draftSentToClientDate', 'clientConfirmationStatus',
  'blType', 'telexReleaseSentDate', 'numberOfOriginalBLs', 'freightTermsOnBL', 'placeOfIssue', 'dateOfIssue',
  'finalLoadListStatus', 'dgManifestRequired', 'dgManifestStatus', 'reeferManifestRequired', 'reeferManifestStatus',
  'paymentRequestSent', 'invoiceStatus', 'preAlertSent', 'subManifestNafezaSubmitted', 'subManifestIssuedSent',
  'podAgentUpdateLog', 'customerNotifiedDate',
  // Sprint 007 — Step 4 / Step 5 (approval handshake included)
  ...BL_STEP_FIELDS[4], ...BL_STEP_FIELDS[5], ...APPROVAL_FIELDS,
]

// What actually prints on the B/L — only a change here (not a reason, SI reference, customs data ...)
// sends an approved draft back to Pending (BR-4.4).
const BL_PRINTED_CONTENT = [
  'exactShipper', 'exactConsignee', 'exactNotify', 'alsoNotify', 'marksAndNumbers', 'exactDescription',
  'finalTotalPackages', 'finalGrossWeight', 'finalCbm', 'finalPackageType', 'placeOfReceipt', 'placeOfDelivery',
  'shippersLoadStowCount', 'lcDetails', 'blRemarks', 'consigneeToOrder', 'notifyPartyName', 'notifyPartyAddress',
]

const BL_PROJECTION = [...BL_CONTEXT_FIELDS, ...BL_EDITABLE_FIELDS].join(' ')

const BL_POPULATE_FIELDS = [
  { path: 'pol', select: 'name code country' },
  { path: 'pod', select: 'name code country' },
  { path: 'quotation', select: 'quotationNo paymentTerms' },
]

export const getBlJobs = async ({ page = 1, limit = 20, search } = {}) => {
  const filter = buildBookingFilter({ search, searchFields: ['jobNo', 'clientName'] })
  const skip = (Number(page) - 1) * Number(limit)
  const total = await Booking.countDocuments(filter)
  const bookings = await Booking.find(filter)
    .select(BL_PROJECTION)
    .populate(BL_POPULATE_FIELDS)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
  return { bookings, total, page: Number(page), pages: Math.ceil(total / Number(limit)) }
}

export const getBlById = async (id) => {
  const booking = await Booking.findById(id).select(BL_PROJECTION).populate(BL_POPULATE_FIELDS)
  if (!booking) throw Object.assign(new Error('Job not found'), { statusCode: 404 })
  return booking
}

export const updateBl = async (id, data) => {
  const booking = await Booking.findById(id)
  if (!booking) throw Object.assign(new Error('Job not found'), { statusCode: 404 })
  if (booking.status === 'cancelled') {
    throw Object.assign(new Error('Cannot update a cancelled booking'), { statusCode: 400 })
  }

  const wasApproved = booking.clientConfirmationStatus === 'Confirmed'
  for (const field of BL_EDITABLE_FIELDS) {
    if (data[field] !== undefined) booking[field] = data[field]
  }
  // Approval locks the B/L content (BR-4.3); changing content that is still open after an approval
  // sends the draft back to Pending (BR-4.4).
  const changed = booking.modifiedPaths().map((p) => p.split('.')[0])
  const contentChanged = changed.some((f) => BL_PRINTED_CONTENT.includes(f))
  if (wasApproved && contentChanged && booking.clientConfirmationStatus === 'Confirmed' && !booking.isModified('clientConfirmationStatus')) {
    booking.clientConfirmationStatus = 'Pending'
    booking.approvedAt = undefined
    booking.approvedBy = undefined
  }
  assertNotLocked(booking, booking.modifiedPaths())
  await booking.save()

  return Booking.findById(id).select(BL_PROJECTION).populate(BL_POPULATE_FIELDS)
}

// ─── Confirm Booking ──────────────────────────────────────────────────────────
export const confirmBooking = async (id) => {
  const booking = await Booking.findById(id)
  if (!booking) throw Object.assign(new Error('Booking not found'), { statusCode: 404 })
  if (booking.status !== 'pending') {
    throw Object.assign(new Error(`Cannot confirm a booking with status: ${booking.status}`), { statusCode: 400 })
  }
  if (!booking.depot) {
    throw Object.assign(new Error('Select a depot before confirming this booking'), { statusCode: 400 })
  }

  booking.status = 'confirmed'
  await booking.save()

  // Allocate each container line from the depot's oldest free units (FIFO),
  // scoped to this booking's NVOCC + depot so allocation never draws down a
  // different NVOCC's or depot's physical containers; every unit is stamped
  // with this booking's id so cancelBooking() releases exactly these units.
  // The seal numbers typed on the Depot step are applied in slot order to the
  // units allocated for that container type.
  const sealsByType = {}
  for (const p of booking.containerAssignments || []) {
    const key = String(p.containerType)
    ;(sealsByType[key] = sealsByType[key] || []).push(p.sealNumber || '')
  }
  for (const entry of booking.containers) {
    try {
      const ids = await decrementStock(entry.containerType, entry.quantity, booking.nvocc, booking.depot, booking._id)
      await applySeals(ids, sealsByType[String(entry.containerType)])
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
  if (isIssued(booking)) {
    throw Object.assign(new Error('The HBL has been issued — re-issue it (Amend) before cancelling the job'), { statusCode: 409 })
  }

  const wasConfirmed = booking.status === 'confirmed'
  booking.status = 'cancelled'
  await booking.save()

  // Restore stock if it was previously confirmed — incrementStock releases
  // exactly the units decrementStock stamped with this booking's id, not a
  // FIFO/LIFO guess.
  if (wasConfirmed) {
    for (const entry of booking.containers) {
      try {
        await incrementStock(entry.containerType, entry.quantity, booking.nvocc, booking._id)
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
  if (booking.bookingConfirmationFile?.filePath) {
    const filePath = path.join(process.cwd(), 'uploads', 'booking-confirmations', booking.bookingConfirmationFile.filePath)
    fs.unlink(filePath, () => {})
  }
  if (booking.customsCertificateFile?.filePath) {
    const filePath = path.join(process.cwd(), 'uploads', 'customs-certificates', booking.customsCertificateFile.filePath)
    fs.unlink(filePath, () => {})
  }

  await booking.deleteOne()
  // The quotation this job came from is no longer "converted": clear the link so it can be
  // converted again, or deleted.
  if (booking.quotation) {
    await Quotation.updateOne({ _id: booking.quotation, linkedBooking: booking._id }, { $set: { linkedBooking: null, convertedAt: null } })
  }
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
    status: b.status,
    jobStatus: b.jobStatus,
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
    { header: 'Job No', key: 'jobNo', width: 30 },
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
    { header: 'Job Status', key: 'jobStatus', width: 14 },
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
      jobStatus: b.jobStatus || '',
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

// ─── DG attachments live on the linked quotation ─────────────────────────────
// The Job form shows the MSDS files already attached to its quotation; this
// streams one of them for anyone who can read the booking (not just people
// holding quotation:read).
export const getQuotationMsdsFile = async (bookingId, fileId) => {
  const booking = await Booking.findById(bookingId).select('quotation')
  if (!booking) throw Object.assign(new Error('Booking not found'), { statusCode: 404 })
  if (!booking.quotation) throw Object.assign(new Error('This booking has no quotation'), { statusCode: 404 })
  return getMsdsFile(booking.quotation, fileId)
}
