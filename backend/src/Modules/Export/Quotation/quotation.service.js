import mongoose from 'mongoose'
import Quotation, { ORIGIN_LINE_KEYS, DESTINATION_LINE_KEYS } from './quotation.model.js'
import ContainerType from '../../MasterData/ContainerType/containerType.model.js'
import JobCounter from '../Booking/jobCounter.model.js'

// MVP scope cut — no settings/admin-configurable UI exists yet in this
// codebase, so the minimum acceptable margin is a plain constant here,
// same pattern as other "deliberate MVP scope cuts" documented in CLAUDE.md.
const MIN_MARGIN_PERCENT = 10

const POPULATE_FIELDS = [
  { path: 'customer', select: 'name email phone' },
  { path: 'containers.containerType', select: 'code label' },
  { path: 'pol', select: 'name code country' },
  { path: 'pod', select: 'name code country' },
  { path: 'nvocc', select: 'name code contractType contractValidFrom contractValidTo tradeLane address contacts' },
  { path: 'approvedBy', select: 'name email' },
  { path: 'linkedBooking', select: 'jobNo status' },
  { path: 'updatedBy', select: 'name email' },
]

const QUOTATION_STATUSES = ['draft', 'sent', 'negotiation', 'approved', 'rejected']

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Whitelisted the same way booking.service.js's buildBookingFilter is —
// query-string values are validated against a fixed enum before ever
// reaching a Mongo filter, not assigned straight through.
const buildQuotationFilter = ({ status, search } = {}) => {
  const filter = {}
  if (status && QUOTATION_STATUSES.includes(status)) filter.status = status
  if (search && typeof search === 'string') {
    const regex = { $regex: escapeRegex(search), $options: 'i' }
    filter.$or = [{ quotationNo: regex }, { clientName: regex }]
  }
  return filter
}

// Rate tables price each line per container SIZE (20ft / 40ft), and the size
// is detected from the ContainerType code's leading digits (20DC, 20OT -> 20;
// 40HC, 40RF, 40OT -> 40). Mirrored in frontend/src/utils/quotationCalc.js.
const CONTAINER_SIZES = [20, 40]

const getContainerSize = (code) => {
  const match = /^(\d{2})/.exec(String(code || '').trim())
  const size = match ? Number(match[1]) : null
  return CONTAINER_SIZES.includes(size) ? size : null
}

const getQtyBySize = async (containers) => {
  const idOf = (c) => c.containerType?._id || c.containerType
  const types = await ContainerType.find({ _id: { $in: (containers || []).map(idOf) } }).select('code').lean()
  const sizeById = new Map(types.map((t) => [String(t._id), getContainerSize(t.code)]))
  const qtyBySize = { 20: 0, 40: 0 }
  for (const c of containers || []) {
    const size = sizeById.get(String(idOf(c)))
    if (size) qtyBySize[size] += Number(c.quantity) || 0
  }
  return qtyBySize
}

// rate × qty for each size; qty falls back to the quotation's container count
// for that size unless the line carries its own override.
const lineTotal = (line, qtyBySize) => {
  if (!line) return 0
  return CONTAINER_SIZES.reduce((sum, size) => {
    const override = line[`qty${size}`]
    const qty = override === undefined || override === null ? qtyBySize[size] : Number(override) || 0
    return sum + (Number(line[`rate${size}`]) || 0) * qty
  }, 0)
}

// Adds every visible line of one table into `acc` (currency -> amount). A line
// without its own currency (saved before per-row currencies) falls back to the
// legacy table currency.
const addTableTotals = (acc, table, keys, qtyBySize, fallbackCurrency) => {
  if (!table) return
  const hidden = new Set(table.hidden || [])
  const add = (line) => {
    const total = lineTotal(line, qtyBySize)
    if (!total) return
    const currency = String(line.currency ?? fallbackCurrency ?? '').trim().toUpperCase()
    acc.set(currency, (acc.get(currency) || 0) + total)
  }
  keys.filter((key) => !hidden.has(key)).forEach((key) => add(table[key]))
  ;(table.custom || []).forEach(add)
}

// Server-authoritative profitability calc — recomputed on every create/update
// regardless of what the client sends, same principle as Booking's
// clearDangerousNumberIfNotDangerous(). Per currency, never converted.
const applyProfitability = async (quotation) => {
  const qtyBySize = await getQtyBySize(quotation.containers)

  const buying = new Map()
  const selling = new Map()
  addTableTotals(buying, quotation.buyingOrigin, ORIGIN_LINE_KEYS, qtyBySize, quotation.buyingCurrency)
  addTableTotals(buying, quotation.buyingDestination, DESTINATION_LINE_KEYS, qtyBySize, quotation.buyingDestinationCurrency)
  addTableTotals(selling, quotation.sellingOrigin, ORIGIN_LINE_KEYS, qtyBySize, quotation.sellingCurrency)
  addTableTotals(selling, quotation.sellingDestination, DESTINATION_LINE_KEYS, qtyBySize, quotation.sellingDestinationCurrency)

  const rows = [...new Set([...buying.keys(), ...selling.keys()])]
    .map((currency) => {
      const buy = buying.get(currency) || 0
      const sell = selling.get(currency) || 0
      const netProfit = sell - buy
      const marginPercent = sell > 0 ? (netProfit / sell) * 100 : 0
      return { currency, buying: buy, selling: sell, netProfit, marginPercent, belowMinMargin: marginPercent < MIN_MARGIN_PERCENT }
    })
    .sort((x, y) => y.selling - x.selling || y.buying - x.buying || x.currency.localeCompare(y.currency))

  const primary = rows[0]
  quotation.totalsByCurrency = rows
  quotation.totalsCurrency = primary?.currency ?? ''
  quotation.totalBuyingCost = primary?.buying ?? 0
  quotation.totalSellingPrice = primary?.selling ?? 0
  quotation.netProfit = primary?.netProfit ?? 0
  quotation.profitMarginPercent = primary?.marginPercent ?? 0
  // An unpriced draft (no rows) reads as below-margin, as before: it can't be
  // waved through to 'approved' without real numbers.
  quotation.belowMinMargin = rows.length === 0 ? true : rows.some((r) => r.belowMinMargin)
}

const EDITABLE_FIELDS = [
  'customerType', 'customer', 'clientName', 'contactPerson', 'contactPhone', 'contactEmail',
  'clientReferenceNo', 'inquiryDate', 'salesRep', 'commodity', 'hsCode', 'containers',
  'grossWeight', 'cbm', 'isDangerous', 'unNumber', 'pol', 'pod',
  'incoterms', 'targetEtd', 'targetRate', 'cargoReadinessDate', 'specialNotes', 'nvocc',
  'rateValidFrom', 'rateValidTo', 'buyingOrigin', 'buyingDestination',
  'freeTimeBuyingDays', 'rateSourceReference',
  'sellingOrigin', 'sellingDestination',
  'paymentTerms',
]

const clearDangerousFieldsIfNotDangerous = (quotation) => {
  if (!quotation.isDangerous) {
    quotation.unNumber = undefined
  }
}

// ─── Create ───────────────────────────────────────────────────────────────
// Atomic per-year sequence, same technique as Booking's getNextJobNo():
// findOneAndUpdate($inc, upsert) so concurrent creates never collide.
// Format: FQ + last two digits of the year + 4-digit sequence (FQ260001).
const getNextQuotationNo = async () => {
  const year = new Date().getFullYear()
  const counter = await JobCounter.findOneAndUpdate({ _id: `quotation-${year}` }, { $inc: { seq: 1 } }, { upsert: true, new: true })
  return `FQ${String(year).slice(-2)}${String(counter.seq).padStart(4, '0')}`
}

export const createQuotation = async (data, currentUser) => {
  // quotationNo is never accepted from the client.
  const payload = { ...data, quotationNo: await getNextQuotationNo() }
  if (!payload.salesRep) payload.salesRep = currentUser?.name || currentUser?.email
  payload.updatedBy = currentUser?._id || currentUser?.id
  const quotation = new Quotation(payload)
  clearDangerousFieldsIfNotDangerous(quotation)
  await applyProfitability(quotation)
  await quotation.save()
  await quotation.populate(POPULATE_FIELDS)
  return quotation
}

// ─── Get list (paginated) ───────────────────────────────────────────────────
export const getQuotations = async ({ page = 1, limit = 20, status, search } = {}) => {
  const filter = buildQuotationFilter({ status, search })
  const skip = (Number(page) - 1) * Number(limit)
  const total = await Quotation.countDocuments(filter)
  const quotations = await Quotation.find(filter)
    .populate(POPULATE_FIELDS)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
  return { quotations, total, page: Number(page), pages: Math.ceil(total / Number(limit)) }
}

// ─── Get single ──────────────────────────────────────────────────────────
export const getQuotationById = async (id) => {
  const quotation = await Quotation.findById(id).populate(POPULATE_FIELDS)
  if (!quotation) throw Object.assign(new Error('Quotation not found'), { statusCode: 404 })
  return quotation
}

// Once a quotation has gone out (sent) or reached a decision (approved/
// rejected), editing is locked down to holders of quotation:approve
// (admin gets this automatically; manager has it by default — see the
// seed role matrix) rather than every quotation:update holder — same
// reused-permission pattern as the margin-approval gate below.
const LOCKED_STATUSES = ['sent', 'approved', 'rejected']

// ─── Update sections 1–5 ────────────────────────────────────────────────────
export const updateQuotation = async (id, data, currentUser, { canOverride } = {}) => {
  const quotation = await Quotation.findById(id)
  if (!quotation) throw Object.assign(new Error('Quotation not found'), { statusCode: 404 })
  if (LOCKED_STATUSES.includes(quotation.status) && !canOverride) {
    throw Object.assign(
      new Error(`Cannot edit a quotation with status: ${quotation.status} — requires quotation:approve permission`),
      { statusCode: 403 }
    )
  }

  for (const field of EDITABLE_FIELDS) {
    if (data[field] !== undefined) quotation[field] = data[field]
  }
  clearDangerousFieldsIfNotDangerous(quotation)
  await applyProfitability(quotation)
  quotation.updatedBy = currentUser?._id || currentUser?.id

  await quotation.save()
  await quotation.populate(POPULATE_FIELDS)
  return quotation
}

// ─── Status transitions ─────────────────────────────────────────────────────
const ALLOWED_TRANSITIONS = {
  draft: ['sent'],
  sent: ['negotiation', 'approved', 'rejected'],
  negotiation: ['sent', 'approved', 'rejected'],
  approved: [],
  rejected: [],
}

export const updateStatus = async (id, { status, rejectionReason }, { canApprove } = {}) => {
  const quotation = await Quotation.findById(id)
  if (!quotation) throw Object.assign(new Error('Quotation not found'), { statusCode: 404 })

  const allowed = ALLOWED_TRANSITIONS[quotation.status] || []
  if (!allowed.includes(status)) {
    throw Object.assign(new Error(`Cannot move a quotation from ${quotation.status} to ${status}`), { statusCode: 400 })
  }

  if (status === 'rejected' && !(rejectionReason && rejectionReason.trim())) {
    throw Object.assign(new Error('Rejection reason is required'), { statusCode: 400 })
  }

  if (status === 'approved' && quotation.belowMinMargin && !canApprove) {
    throw Object.assign(
      new Error('This quotation is below the minimum margin and requires quotation:approve permission'),
      { statusCode: 403 }
    )
  }

  return { quotation, allowed }
}

export const applyStatusChange = async (quotation, status, { rejectionReason, approvedByUserId, updatedByUserId } = {}) => {
  quotation.status = status
  if (status === 'rejected') quotation.rejectionReason = rejectionReason.trim()
  if (status === 'approved') quotation.approvedBy = approvedByUserId
  quotation.updatedBy = updatedByUserId
  await quotation.save()
  await quotation.populate(POPULATE_FIELDS)
  return quotation
}

// ─── Suggest last buying rate for an NVOCC ──────────────────────────────────
// "the system suggests the last contracted price, if one was saved" — rather
// than a separate rate-history master table, this looks up the most recent
// OTHER quotation that used the same NVOCC and returns its buying section as
// a starting point; the user can still edit it freely (some rates are Spot,
// not Contract).
export const suggestRateForNvocc = async (nvoccId, excludeId) => {
  if (!mongoose.Types.ObjectId.isValid(nvoccId)) return null
  const filter = { nvocc: nvoccId }
  if (excludeId && mongoose.Types.ObjectId.isValid(excludeId)) filter._id = { $ne: excludeId }

  const last = await Quotation.findOne(filter)
    .sort({ createdAt: -1 })
    .select('buyingCurrency buyingOrigin buyingDestinationCurrency buyingDestination freeTimeBuyingDays rateSourceReference quotationNo createdAt')

  return last || null
}

// ─── Convert-to-booking bookkeeping ──────────────────────────────────────────
// Checked BEFORE the Booking is created (so an ineligible quotation never
// leaves an orphaned Booking behind on failure), then re-checked and
// committed by markConverted() right after the Booking actually saves.
export const assertConvertible = async (quotationId) => {
  const quotation = await Quotation.findById(quotationId)
  if (!quotation) throw Object.assign(new Error('Quotation not found'), { statusCode: 404 })
  if (quotation.status !== 'approved') {
    throw Object.assign(new Error('Only an approved quotation can be converted to a booking'), { statusCode: 400 })
  }
  if (quotation.linkedBooking) {
    throw Object.assign(new Error('This quotation has already been converted to a booking'), { statusCode: 409 })
  }
  return quotation
}

export const markConverted = async (quotationId, bookingId) => {
  const quotation = await assertConvertible(quotationId)
  quotation.linkedBooking = bookingId
  quotation.convertedAt = new Date()
  await quotation.save()
  return quotation
}
