import mongoose from 'mongoose'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import Quotation, { ORIGIN_LINE_KEYS, DESTINATION_LINE_KEYS, MSDS_MAX_FILES, QUOTATION_STATUSES } from './quotation.model.js'
import ContainerType from '../../MasterData/ContainerType/containerType.model.js'
import Customer from '../../MasterData/Customer/customer.model.js'
import Booking from '../Booking/booking.model.js'
import JobCounter from '../Booking/jobCounter.model.js'

// MVP scope cut — no settings/admin-configurable UI exists yet in this
// codebase, so the minimum acceptable margin is a plain constant here,
// same pattern as other "deliberate MVP scope cuts" documented in CLAUDE.md.
const MIN_MARGIN_PERCENT = 10

const POPULATE_FIELDS = [
  { path: 'customer', select: 'name email phone creditHold' },
  { path: 'containers.containerType', select: 'code label maxPayloadKg capacityCbm' },
  { path: 'pol', select: 'name code country' },
  { path: 'pod', select: 'name code country' },
  { path: 'finalDestination', select: 'name code country' },
  { path: 'transshipmentPort', select: 'name code country' },
  { path: 'nvocc', select: 'name code contractType tradeLane country city address contacts portsServed acceptsDg defaultFreeTimeDays' },
  { path: 'plannedVesselOperator', select: 'name' },
  { path: 'revisedFrom', select: 'quotationNo status' },
  { path: 'revisedTo', select: 'quotationNo status' },
  { path: 'approvedBy', select: 'name email' },
  { path: 'linkedBooking', select: 'jobNo status' },
  { path: 'updatedBy', select: 'name email' },
]

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
export const CONTAINER_SIZES = [20, 40]

const getContainerSize = (code) => {
  const match = /^(\d{2})/.exec(String(code || '').trim())
  const size = match ? Number(match[1]) : null
  return CONTAINER_SIZES.includes(size) ? size : null
}

export const getQtyBySize = async (containers) => {
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
export const lineTotal = (line, qtyBySize) => {
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
  'clientReferenceNo', 'inquiryDate', 'validityDate', 'salesRep', 'commodity', 'hsCode', 'containers',
  'grossWeight', 'cbm', 'isDangerous', 'unNumber', 'properShippingName', 'imoClass', 'subsidiaryRisk',
  'packingGroup', 'flashPoint', 'marinePollutant', 'emergencyContact',
  'setTemperature', 'ventilationHumidity', 'oogDimensions',
  'pol', 'pod', 'finalDestination', 'transshipmentPort',
  'incoterms', 'targetEtd', 'targetRate', 'cargoReadinessDate', 'specialNotes', 'nvocc', 'plannedVesselOperator',
  'rateValidFrom', 'rateValidTo', 'buyingOrigin', 'buyingDestination',
  'freeTimeBuyingDays', 'detentionFreeTimeDays', 'rateSourceReference',
  'sellingOrigin', 'sellingDestination',
  'paymentTerms', 'termsRemarks',
]

// Optional references the form clears by sending an empty value.
const NULLABLE_REF_FIELDS = ['finalDestination', 'transshipmentPort', 'plannedVesselOperator']

const idOf = (v) => String(v?._id || v || '')
const badRequest = (message, extra = {}) => Object.assign(new Error(message), { statusCode: 400, ...extra })

const clearDangerousFieldsIfNotDangerous = (quotation) => {
  if (!quotation.isDangerous) {
    quotation.unNumber = undefined
    quotation.properShippingName = undefined
    quotation.imoClass = undefined
    quotation.subsidiaryRisk = undefined
    quotation.packingGroup = undefined
    quotation.flashPoint = undefined
    quotation.marinePollutant = false
    quotation.emergencyContact = undefined
  }
}

// ─── Container-type driven rules ─────────────────────────────────────────────
// Reefer data only belongs to reefer types (…RF), out-of-gauge dimensions only to
// open-top / flat-rack types (…OT, …FR); both are cleared when no such container
// is left in the quotation. Capacity checks (PRD Q-24/Q-25) use the optional
// maxPayloadKg / capacityCbm on the ContainerType master.
export const isReeferCode = (code) => /RF$/i.test(String(code || '').trim())
export const isOogCode = (code) => /(OT|FR)$/i.test(String(code || '').trim())

const loadContainerTypes = async (containers) => {
  const ids = (containers || []).map((c) => idOf(c.containerType)).filter(Boolean)
  const types = await ContainerType.find({ _id: { $in: ids } }).select('code maxPayloadKg capacityCbm').lean()
  return new Map(types.map((t) => [String(t._id), t]))
}

const clearConditionalCargoFields = async (quotation) => {
  const typeById = await loadContainerTypes(quotation.containers)
  const codes = (quotation.containers || []).map((c) => typeById.get(idOf(c.containerType))?.code)
  if (!codes.some(isReeferCode)) {
    quotation.setTemperature = undefined
    quotation.ventilationHumidity = undefined
  }
  if (!codes.some(isOogCode)) quotation.oogDimensions = undefined
  return typeById
}

// Σ(quantity × capacity) over the quotation's container lines, or null when any
// line's type has no capacity configured (then that check is skipped entirely —
// a partial sum would give a false "over the limit").
const capacityLimit = (containers, typeById, field) => {
  let sum = 0
  for (const c of containers || []) {
    const cap = typeById.get(idOf(c.containerType))?.[field]
    if (!cap) return null
    sum += cap * (Number(c.quantity) || 0)
  }
  return sum > 0 ? sum : null
}

const assertCapacity = (quotation, typeById) => {
  const weightLimit = capacityLimit(quotation.containers, typeById, 'maxPayloadKg')
  if (weightLimit && quotation.grossWeight > weightLimit) {
    throw badRequest(`Total gross weight (${quotation.grossWeight} kg) exceeds the payload capacity of the selected containers (${weightLimit} kg)`)
  }
  const volumeLimit = capacityLimit(quotation.containers, typeById, 'capacityCbm')
  if (volumeLimit && quotation.cbm > volumeLimit) {
    throw badRequest(`Total volume (${quotation.cbm} CBM) exceeds the capacity of the selected containers (${volumeLimit} CBM)`)
  }
}

// ─── Carrier eligibility (PRD BR-0.3) & credit hold (Q-10) ───────────────────
// An empty portsServed list means "serves every port", so carriers saved before
// the field existed are never filtered out.
const carrierIssue = (nvocc, pod, isDangerous) => {
  if (!nvocc || typeof nvocc !== 'object') return null
  const name = nvocc.name ? `${nvocc.name} ` : ''
  const served = (nvocc.portsServed || []).map(idOf)
  if (pod && served.length > 0 && !served.includes(idOf(pod))) return `Carrier ${name}does not serve the selected POD`
  if (isDangerous && nvocc.acceptsDg === false) return `Carrier ${name}does not accept dangerous goods`
  return null
}

// Non-blocking hints for the page (needs `containers.containerType`, `nvocc` and
// `customer` populated, which every response path does).
export const getWarnings = (q) => {
  const warnings = []
  const typeById = new Map((q.containers || []).map((c) => [idOf(c.containerType), c.containerType || {}]))
  const weightLimit = capacityLimit(q.containers, typeById, 'maxPayloadKg')
  if (weightLimit && q.grossWeight > weightLimit * 0.95 && q.grossWeight <= weightLimit) {
    warnings.push(`Total gross weight is above 95% of the payload capacity (${weightLimit} kg)`)
  }
  const issue = carrierIssue(q.nvocc, q.pod, q.isDangerous)
  if (issue) warnings.push(issue)
  if (q.customer?.creditHold) warnings.push('This customer is on credit hold')
  return warnings
}

const assertCustomerNotOnHold = async (customerId) => {
  if (!customerId) return
  const customer = await Customer.findById(customerId).select('name creditHold').lean()
  if (customer?.creditHold) throw badRequest(`${customer.name} is on credit hold — quotations cannot be raised for this customer`)
}

// ─── Lazy expiry (PRD Q-03) ──────────────────────────────────────────────────
// No scheduler exists in this codebase, so a sent / negotiation quotation whose
// Validity Date is before today is flipped to 'expired' whenever quotations are
// read or moved. The validity date itself is valid for the whole day.
const todayUtc = () => {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

const expireOverdue = () =>
  Quotation.updateMany({ status: { $in: ['sent', 'negotiation'] }, validityDate: { $lt: todayUtc() } }, { $set: { status: 'expired' } })

// ─── Create ───────────────────────────────────────────────────────────────
// Atomic per-year sequence, same technique as Booking's getNextJobNo():
// findOneAndUpdate($inc, upsert) so concurrent creates never collide.
// Format: FQ + last two digits of the year + 4-digit sequence (FQ260001).
const getNextQuotationNo = async () => {
  const year = new Date().getFullYear()
  const counter = await JobCounter.findOneAndUpdate({ _id: `quotation-${year}` }, { $inc: { seq: 1 } }, { upsert: true, new: true })
  return `FQ${String(year).slice(-2)}${String(counter.seq).padStart(4, '0')}`
}

// Shared by create / update: clears data that no longer applies, runs the
// capacity guard and recomputes the profitability. Carrier eligibility is NOT a
// save-time guard (the POD and the carrier live in different saved parts of the
// form, so blocking either save would deadlock a legitimate POD+carrier change);
// it is enforced at send / approve / convert by the readiness gate and shown as a
// warning meanwhile.
const finalizeQuotation = async (quotation) => {
  clearDangerousFieldsIfNotDangerous(quotation)
  const typeById = await clearConditionalCargoFields(quotation)
  assertCapacity(quotation, typeById)
  await applyProfitability(quotation)
}

export const createQuotation = async (data, currentUser) => {
  // quotationNo is never accepted from the client.
  const quotationNo = await getNextQuotationNo()
  const payload = { ...data, quotationNo, baseNo: quotationNo, revision: 0 }
  NULLABLE_REF_FIELDS.forEach((f) => { if (!payload[f]) payload[f] = null })
  if (!payload.salesRep) payload.salesRep = currentUser?.name || currentUser?.email
  payload.updatedBy = currentUser?._id || currentUser?.id
  await assertCustomerNotOnHold(payload.customer)
  const quotation = new Quotation(payload)
  await finalizeQuotation(quotation)
  await quotation.save()
  await quotation.populate(POPULATE_FIELDS)
  return quotation
}

// ─── Get list (paginated) ───────────────────────────────────────────────────
export const getQuotations = async ({ page = 1, limit = 20, status, search } = {}) => {
  await expireOverdue()
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
  await expireOverdue()
  const quotation = await Quotation.findById(id).populate(POPULATE_FIELDS)
  if (!quotation) throw Object.assign(new Error('Quotation not found'), { statusCode: 404 })
  return quotation
}

// Once a quotation has gone out (sent) or reached a decision (approved/
// rejected/expired), editing is locked down to holders of quotation:approve
// (admin gets this automatically; manager has it by default — see the
// seed role matrix) rather than every quotation:update holder — same
// reused-permission pattern as the margin-approval gate below. A quotation that
// has been revised is superseded and never editable again.
const LOCKED_STATUSES = ['sent', 'approved', 'rejected', 'expired']

const assertEditable = (quotation, { canOverride } = {}) => {
  if (quotation.revisedTo) {
    throw badRequest('This quotation has been replaced by a newer revision and can no longer be edited')
  }
  if (LOCKED_STATUSES.includes(quotation.status) && !canOverride) {
    throw Object.assign(
      new Error(`Cannot edit a quotation with status: ${quotation.status} — requires quotation:approve permission`),
      { statusCode: 403 }
    )
  }
}

// ─── Update sections 1–5 ────────────────────────────────────────────────────
export const updateQuotation = async (id, data, currentUser, { canOverride } = {}) => {
  await expireOverdue()
  const quotation = await Quotation.findById(id)
  if (!quotation) throw Object.assign(new Error('Quotation not found'), { statusCode: 404 })
  assertEditable(quotation, { canOverride })

  if (data.customer && idOf(data.customer) !== idOf(quotation.customer)) {
    await assertCustomerNotOnHold(data.customer)
  }

  for (const field of EDITABLE_FIELDS) {
    if (data[field] === undefined) continue
    quotation[field] = NULLABLE_REF_FIELDS.includes(field) && !data[field] ? null : data[field]
  }
  // MSDS only belongs to dangerous cargo — switching it off discards the files.
  clearDangerousFieldsIfNotDangerous(quotation)
  if (!quotation.isDangerous && quotation.msdsFiles.length > 0) {
    quotation.msdsFiles.forEach(deleteMsdsFromDisk)
    quotation.msdsFiles = []
  }
  await finalizeQuotation(quotation)
  quotation.updatedBy = currentUser?._id || currentUser?.id

  await quotation.save()
  await quotation.populate(POPULATE_FIELDS)
  return quotation
}

// ─── Delete (permanent — there is no soft delete) ────────────────────────────
// A quotation that already became a job can't be deleted until that job (booking)
// is deleted first. The check looks at the bookings themselves rather than at
// Quotation.linkedBooking, so a stale link can never block the delete.
export const deleteQuotation = async (id) => {
  const quotation = await Quotation.findById(id)
  if (!quotation) throw Object.assign(new Error('Quotation not found'), { statusCode: 404 })

  const job = await Booking.findOne({ quotation: quotation._id }).select('jobNo')
  if (job) {
    throw Object.assign(
      new Error(`This quotation has a job (${job.jobNo}). Delete the job / booking first, then delete the quotation.`),
      { statusCode: 409, jobNo: job.jobNo }
    )
  }

  ;(quotation.msdsFiles || []).forEach(deleteMsdsFromDisk)
  // Revisions point at each other: unlink the neighbours so nothing keeps a dead reference
  // (a superseded original becomes editable again when its revision is deleted).
  await Quotation.updateMany({ revisedTo: quotation._id }, { $set: { revisedTo: null } })
  await Quotation.updateMany({ revisedFrom: quotation._id }, { $set: { revisedFrom: null } })
  await quotation.deleteOne()
  return quotation
}

// ─── Revise / Duplicate (PRD BR-0.5 + the Duplicate button) ──────────────────
// Both copy the editable data into a NEW draft. MSDS files are copied on disk
// too (a shared path would let deleting one quotation's file break the other).
// Revise keeps the base number with an -R<n> suffix and supersedes the old
// document (revisedTo); Duplicate gets a fresh FQ number and stands alone.
const copyMsdsFiles = async (files) => {
  const copies = []
  for (const f of files || []) {
    const name = `${crypto.randomUUID()}${path.extname(f.filePath || '')}`
    try {
      await fs.promises.copyFile(msdsDiskPath(f), path.join(MSDS_DIR, name))
      copies.push({ fileName: f.fileName, filePath: name, mimeType: f.mimeType, uploadedAt: new Date() })
    } catch {
      // the source file is gone from disk — skip it rather than fail the copy
    }
  }
  return copies
}

const cloneEditableData = (source) => {
  const plain = source.toObject()
  const data = {}
  for (const field of EDITABLE_FIELDS) {
    if (plain[field] !== undefined) data[field] = plain[field]
  }
  // A fresh quotation date; the validity date must be re-entered for the new quote.
  data.inquiryDate = new Date()
  data.validityDate = undefined
  return data
}

const REVISABLE_STATUSES = ['sent', 'negotiation', 'rejected', 'expired']

export const reviseQuotation = async (id, currentUser) => {
  await expireOverdue()
  const source = await Quotation.findById(id)
  if (!source) throw Object.assign(new Error('Quotation not found'), { statusCode: 404 })
  if (source.revisedTo) throw Object.assign(new Error('This quotation has already been revised'), { statusCode: 409 })
  if (!REVISABLE_STATUSES.includes(source.status)) {
    throw badRequest(`A quotation with status ${source.status} cannot be revised${source.status === 'draft' ? ' — just edit it' : ''}`)
  }

  const baseNo = source.baseNo || source.quotationNo
  const revision = (source.revision || 0) + 1
  const revised = new Quotation({
    ...cloneEditableData(source),
    quotationNo: `${baseNo}-R${revision}`,
    baseNo,
    revision,
    revisedFrom: source._id,
    msdsFiles: await copyMsdsFiles(source.msdsFiles),
    updatedBy: currentUser?._id || currentUser?.id,
  })
  await applyProfitability(revised)
  await revised.save()

  source.revisedTo = revised._id
  await source.save()

  await revised.populate(POPULATE_FIELDS)
  return revised
}

export const duplicateQuotation = async (id, currentUser) => {
  const source = await Quotation.findById(id)
  if (!source) throw Object.assign(new Error('Quotation not found'), { statusCode: 404 })
  await assertCustomerNotOnHold(source.customer)

  const quotationNo = await getNextQuotationNo()
  const copy = new Quotation({
    ...cloneEditableData(source),
    quotationNo,
    baseNo: quotationNo,
    revision: 0,
    msdsFiles: await copyMsdsFiles(source.msdsFiles),
    updatedBy: currentUser?._id || currentUser?.id,
  })
  await applyProfitability(copy)
  await copy.save()
  await copy.populate(POPULATE_FIELDS)
  return copy
}

// ─── MSDS files (dangerous goods) ───────────────────────────────────────────
// Up to MSDS_MAX_FILES per quotation, uploaded after the quotation is saved
// (multipart, separate from the JSON save). Follows the same edit lock as
// updateQuotation: sent/approved/rejected needs the quotation:approve override.
const MSDS_DIR = path.join(process.cwd(), 'uploads', 'msds')

// path.basename: filePath is a server-generated bare filename; this is defense
// in depth so a bad stored value could never escape the MSDS directory.
const msdsDiskPath = (file) => path.join(MSDS_DIR, path.basename(file.filePath))
const deleteMsdsFromDisk = (file) => fs.unlink(msdsDiskPath(file), () => {})

const loadForMsdsEdit = async (id, { canOverride } = {}) => {
  const quotation = await Quotation.findById(id)
  if (!quotation) throw Object.assign(new Error('Quotation not found'), { statusCode: 404 })
  if (LOCKED_STATUSES.includes(quotation.status) && !canOverride) {
    throw Object.assign(
      new Error(`Cannot edit a quotation with status: ${quotation.status} — requires quotation:approve permission`),
      { statusCode: 403 }
    )
  }
  return quotation
}

export const addMsdsFiles = async (id, files, currentUser, { canOverride } = {}) => {
  const discard = () => files.forEach((f) => fs.unlink(f.path, () => {}))
  try {
    const quotation = await loadForMsdsEdit(id, { canOverride })
    if (!quotation.isDangerous) {
      throw Object.assign(new Error('MSDS files can only be attached when Dangerous Goods is Yes (save the quotation first)'), { statusCode: 400 })
    }
    if (quotation.msdsFiles.length + files.length > MSDS_MAX_FILES) {
      throw Object.assign(
        new Error(`A quotation can hold at most ${MSDS_MAX_FILES} MSDS files (it has ${quotation.msdsFiles.length})`),
        { statusCode: 400 }
      )
    }
    files.forEach((f) =>
      quotation.msdsFiles.push({ fileName: f.originalname, filePath: f.filename, mimeType: f.mimetype, uploadedAt: new Date() })
    )
    quotation.updatedBy = currentUser?._id || currentUser?.id
    await quotation.save()
    await quotation.populate(POPULATE_FIELDS)
    return quotation
  } catch (err) {
    discard()
    throw err
  }
}

export const removeMsdsFile = async (id, fileId, currentUser, { canOverride } = {}) => {
  const quotation = await loadForMsdsEdit(id, { canOverride })
  const file = quotation.msdsFiles.id(fileId)
  if (!file) throw Object.assign(new Error('MSDS file not found'), { statusCode: 404 })
  deleteMsdsFromDisk(file)
  file.deleteOne()
  quotation.updatedBy = currentUser?._id || currentUser?.id
  await quotation.save()
  await quotation.populate(POPULATE_FIELDS)
  return quotation
}

export const getMsdsFile = async (id, fileId) => {
  const quotation = await Quotation.findById(id)
  if (!quotation) throw Object.assign(new Error('Quotation not found'), { statusCode: 404 })
  const file = quotation.msdsFiles.id(fileId)
  if (!file) throw Object.assign(new Error('MSDS file not found'), { statusCode: 404 })
  return { path: msdsDiskPath(file), fileName: file.fileName }
}

// ─── Readiness: required data before send / approve / convert ──────────────
// Saving a draft only needs the basics (the create/update validation). Before a
// quotation can be SENT to the client, APPROVED, or CONVERTED into a booking job
// it must be complete — enforced here on the server (the page also shows the
// list so people see what's missing). Returns a list of human-readable issues.

// Needs `containers.containerType` and `nvocc` populated (every response path and
// assertReady() below make sure of that).
export const getReadinessIssues = (q) => {
  const issues = []
  const has = (v) => !!(v && String(v).trim())
  const positive = (v) => v !== undefined && v !== null && v !== '' && Number(v) > 0
  const S1 = '1. Client Request Data'
  const S2 = '2. Ports'
  const S3 = '3. Containers & Cargo'
  const S5 = '5. Carrier & Commercial Terms'

  if (!q.customer || !has(q.clientName)) issues.push(`${S1}: select the client`)
  if (!has(q.contactPhone)) issues.push(`${S1}: contact phone`)
  if (!has(q.contactEmail)) issues.push(`${S1}: contact email`)
  if (!has(q.salesRep)) issues.push(`${S1}: sales representative`)
  if (!q.inquiryDate) issues.push(`${S1}: quotation date`)
  if (!q.validityDate) issues.push(`${S1}: validity date`)

  if (!q.pol) issues.push(`${S2}: port of loading (POL)`)
  if (!q.pod) issues.push(`${S2}: port of discharge (POD)`)
  if (q.pol && q.pod && idOf(q.pol) === idOf(q.pod)) issues.push(`${S2}: POL and POD must be different ports`)
  if (!q.incoterms) issues.push(`${S2}: incoterms`)

  if (!has(q.commodity)) issues.push(`${S3}: commodity`)
  const containers = q.containers || []
  if (containers.length === 0 || containers.some((c) => !c.containerType || !(c.quantity >= 1))) {
    issues.push(`${S3}: at least one container with a type and quantity`)
  }
  if (!positive(q.grossWeight)) issues.push(`${S3}: total gross weight (kg)`)
  if (!positive(q.cbm)) issues.push(`${S3}: total volume (CBM)`)
  const codes = containers.map((c) => c.containerType?.code)
  if (codes.some(isReeferCode) && (q.setTemperature === undefined || q.setTemperature === null)) {
    issues.push(`${S3}: set temperature (reefer container)`)
  }
  if (q.isDangerous) {
    if (!has(q.unNumber)) issues.push(`${S3}: UN number (dangerous goods)`)
    if (!has(q.properShippingName)) issues.push(`${S3}: proper shipping name (dangerous goods)`)
    if (!has(q.imoClass)) issues.push(`${S3}: IMO class (dangerous goods)`)
    if (!has(q.packingGroup)) issues.push(`${S3}: packing group (dangerous goods)`)
    if (q.imoClass === '3' && (q.flashPoint === undefined || q.flashPoint === null)) issues.push(`${S3}: flash point (class 3)`)
    if (!has(q.emergencyContact)) issues.push(`${S3}: emergency contact (dangerous goods)`)
    if ((q.msdsFiles || []).length === 0) issues.push(`${S3}: attach at least one MSDS file (dangerous goods)`)
  }

  if (!q.nvocc) issues.push(`${S5}: select the carrier`)
  const carrierProblem = carrierIssue(q.nvocc, q.pod, q.isDangerous)
  if (carrierProblem) issues.push(`${S5}: ${carrierProblem}`)
  if (q.freeTimeBuyingDays === undefined || q.freeTimeBuyingDays === null) issues.push(`${S5}: client free time (demurrage days)`)

  const rows = q.totalsByCurrency || []
  if (!rows.some((r) => r.buying > 0)) issues.push('6. Buying Rate: price at least one buying charge')
  if (!rows.some((r) => r.selling > 0)) issues.push('7. Selling Price to Client: price at least one selling charge')
  if (!q.paymentTerms) issues.push('7. Selling Price to Client: payment terms')
  return issues
}

const READINESS_POPULATE = [
  { path: 'containers.containerType', select: 'code label maxPayloadKg capacityCbm' },
  { path: 'nvocc', select: 'name code portsServed acceptsDg' },
]

const assertReady = async (quotation, action) => {
  await quotation.populate(READINESS_POPULATE)
  const issues = getReadinessIssues(quotation)
  if (issues.length > 0) {
    throw Object.assign(new Error(`This quotation is not ready to be ${action}. Complete: ${issues.join('; ')}`), { statusCode: 400, issues })
  }
}

// ─── Status transitions ─────────────────────────────────────────────────────
// 'expired' is only ever set by the lazy expiry (never by a request) and is
// terminal, like rejected — the way forward is Revise.
const ALLOWED_TRANSITIONS = {
  draft: ['sent'],
  sent: ['negotiation', 'approved', 'rejected'],
  negotiation: ['sent', 'approved', 'rejected'],
  approved: [],
  rejected: [],
  expired: [],
}

export const updateStatus = async (id, { status, rejectionReason }, { canApprove } = {}) => {
  await expireOverdue()
  const quotation = await Quotation.findById(id)
  if (!quotation) throw Object.assign(new Error('Quotation not found'), { statusCode: 404 })

  if (quotation.revisedTo) throw badRequest('This quotation has been replaced by a newer revision')
  if (quotation.status === 'expired') {
    throw badRequest('This quotation has expired (its validity date has passed) — revise it to send a new offer')
  }

  const allowed = ALLOWED_TRANSITIONS[quotation.status] || []
  if (!allowed.includes(status)) {
    throw Object.assign(new Error(`Cannot move a quotation from ${quotation.status} to ${status}`), { statusCode: 400 })
  }

  if (status === 'rejected' && !(rejectionReason && rejectionReason.trim())) {
    throw Object.assign(new Error('Rejection reason is required'), { statusCode: 400 })
  }

  if (status === 'sent') {
    await assertCustomerNotOnHold(quotation.customer)
    await assertReady(quotation, 'sent to the client')
  }
  if (status === 'approved') await assertReady(quotation, 'approved')

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
  await assertReady(quotation, 'converted to a booking job')
  return quotation
}

export const markConverted = async (quotationId, bookingId) => {
  const quotation = await assertConvertible(quotationId)
  quotation.linkedBooking = bookingId
  quotation.convertedAt = new Date()
  await quotation.save()
  return quotation
}
