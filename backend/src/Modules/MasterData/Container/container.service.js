import mongoose from 'mongoose'
import crypto from 'crypto'
import Container from './container.model.js'
import ContainerType from '../ContainerType/containerType.model.js'
import Nvocc from '../Nvocc/nvocc.model.js'
import Depot from '../Depot/depot.model.js'

// Validate + cast to ObjectId explicitly rather than assigning the raw query
// value: aggregate() (unlike find()) never auto-casts, so an un-cast string
// filter silently matches nothing — and an unvalidated value could otherwise
// carry a query operator (e.g. `?containerType[$ne]=x`) straight into a filter.
const castId = (v) => (v && mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(v) : undefined)

const buildFilter = ({ containerType, nvocc, depot, booking } = {}) => {
  const filter = {}
  const ct = castId(containerType)
  if (ct) filter.containerType = ct
  const nv = castId(nvocc)
  if (nv) filter.nvocc = nv
  const dp = castId(depot)
  if (dp) filter.depot = dp
  const bk = castId(booking)
  if (bk) filter.booking = bk
  return filter
}

// ─── Overview: one row per (containerType, nvocc, depot) with available/total counts ─
export const getStockOverview = async ({ containerType, nvocc, depot } = {}) => {
  const match = buildFilter({ containerType, nvocc, depot })
  const rows = await Container.aggregate([
    { $match: match },
    {
      $group: {
        _id: { containerType: '$containerType', nvocc: '$nvocc', depot: '$depot' },
        total: { $sum: 1 },
        available: { $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] } },
      },
    },
    {
      $lookup: {
        from: 'containertypes',
        localField: '_id.containerType',
        foreignField: '_id',
        as: 'containerType',
      },
    },
    {
      $lookup: {
        from: 'nvoccs',
        localField: '_id.nvocc',
        foreignField: '_id',
        as: 'nvocc',
      },
    },
    {
      $lookup: {
        from: 'depots',
        localField: '_id.depot',
        foreignField: '_id',
        as: 'depot',
      },
    },
    { $unwind: '$containerType' },
    { $unwind: '$nvocc' },
    { $unwind: '$depot' },
    {
      $project: {
        _id: 0,
        containerType: { _id: '$containerType._id', code: '$containerType.code', label: '$containerType.label' },
        nvocc: { _id: '$nvocc._id', name: '$nvocc.name', code: '$nvocc.code' },
        depot: { _id: '$depot._id', name: '$depot.name', code: '$depot.code' },
        total: 1,
        available: 1,
      },
    },
    { $sort: { 'containerType.code': 1, 'depot.name': 1, 'nvocc.name': 1 } },
  ])
  return rows
}

// ─── Group detail: full list of individual container units for a filter ──────
export const getContainers = async ({ containerType, nvocc, depot, booking } = {}) => {
  const filter = buildFilter({ containerType, nvocc, depot, booking })
  return Container.find(filter)
    .populate('containerType', 'code label')
    .populate('nvocc', 'name code')
    .populate('depot', 'name code')
    .populate('booking', 'jobNo status')
    .sort({ createdAt: -1 })
}

// ─── Delete a single unit ──────────────────────────────────────────────────
export const deleteContainer = async (id) => {
  const container = await Container.findById(id)
  if (!container) throw Object.assign(new Error('Container not found'), { statusCode: 404 })
  if (container.status === 'allocated') {
    throw Object.assign(new Error('Container is allocated to a confirmed booking and cannot be deleted'), { statusCode: 409 })
  }
  await container.deleteOne()
  return container
}

// ─── Update per-unit operational fields (Job form's Containers section) ──────
// Only allowed once a unit is actually allocated to a booking — these fields
// (seal number, container status, gate-in date, VAS upload status, guarantee
// receipt status) describe a specific job's fulfillment, not stock at rest.
const UNIT_EDITABLE_FIELDS = ['sealNumber', 'guaranteeReceiptStatus', 'containerStatus', 'gateInDate', 'vasUploadStatus']

export const updateContainerUnit = async (id, data) => {
  const container = await Container.findById(id)
  if (!container) throw Object.assign(new Error('Container not found'), { statusCode: 404 })
  if (container.status !== 'allocated') {
    throw Object.assign(new Error('Only a container allocated to a booking can have its operational fields edited'), { statusCode: 400 })
  }
  for (const field of UNIT_EDITABLE_FIELDS) {
    if (data[field] !== undefined) container[field] = data[field]
  }
  await container.save()
  await container.populate([
    { path: 'containerType', select: 'code label' },
    { path: 'nvocc', select: 'name code' },
    { path: 'depot', select: 'name code' },
    { path: 'booking', select: 'jobNo status' },
  ])
  return container
}

// ─── Excel import — preview + commit ─────────────────────────────────────────
// Each raw row: { rowNumber, containerTypeCode, nvoccCode, depotCode, containerNumber }
// Classifies every row as one of:
//   'invalid'   — empty / missing a field / unknown type, NVOCC, or depot code
//   'duplicate' — container number already in stock, or repeated in this file
//   'valid'     — ready to import
// Re-run from scratch on every call (preview AND commit) so commit never
// trusts client-supplied validity — it only trusts the raw cell values.
const validateRows = async (rows) => {
  const [typeDocs, nvoccDocs, depotDocs] = await Promise.all([ContainerType.find(), Nvocc.find(), Depot.find()])
  const typeByCode = new Map(typeDocs.map((t) => [t.code.toUpperCase(), t]))
  const nvoccByCode = new Map(nvoccDocs.map((n) => [n.code.toUpperCase(), n]))
  const depotByCode = new Map(depotDocs.map((d) => [d.code.toUpperCase(), d]))
  const existingNumbers = new Set(
    (await Container.find().select('containerNumber').lean()).map((c) => c.containerNumber)
  )
  const seenInFile = new Map()

  return rows.map((row) => {
    const { rowNumber, containerTypeCode, nvoccCode, depotCode, containerNumber } = row
    const base = { rowNumber, containerTypeCode, nvoccCode, depotCode, containerNumber }

    if (!containerTypeCode && !nvoccCode && !depotCode && !containerNumber) {
      return { ...base, status: 'invalid', message: 'Empty row' }
    }
    if (!containerTypeCode || !nvoccCode || !depotCode || !containerNumber) {
      return { ...base, status: 'invalid', message: 'Missing container type, NVOCC, depot, or container number' }
    }

    const type = typeByCode.get(String(containerTypeCode).trim().toUpperCase())
    if (!type) {
      return { ...base, status: 'invalid', message: `Unknown container type code "${containerTypeCode}"` }
    }
    const nvocc = nvoccByCode.get(String(nvoccCode).trim().toUpperCase())
    if (!nvocc) {
      return { ...base, status: 'invalid', message: `Unknown NVOCC code "${nvoccCode}"` }
    }
    const depot = depotByCode.get(String(depotCode).trim().toUpperCase())
    if (!depot) {
      return { ...base, status: 'invalid', message: `Unknown depot code "${depotCode}"` }
    }

    const number = String(containerNumber).trim().toUpperCase()
    if (existingNumbers.has(number)) {
      return {
        ...base, containerNumber: number, containerTypeLabel: type.label, nvoccName: nvocc.name, depotName: depot.name,
        status: 'duplicate', message: `Container number "${number}" already exists in stock`,
      }
    }
    if (seenInFile.has(number)) {
      return {
        ...base, containerNumber: number, containerTypeLabel: type.label, nvoccName: nvocc.name, depotName: depot.name,
        status: 'duplicate', message: `Duplicate of row ${seenInFile.get(number)} in this file`,
      }
    }
    seenInFile.set(number, rowNumber)

    return {
      ...base,
      containerNumber: number,
      containerTypeId: type._id,
      containerTypeLabel: type.label,
      nvoccId: nvocc._id,
      nvoccName: nvocc.name,
      depotId: depot._id,
      depotName: depot.name,
      status: 'valid',
      message: 'Ready to import',
    }
  })
}

// ─── Manual quick-add — no container numbers supplied, so they're auto-
// generated (unlike the Excel import path, where every number is a real
// physical container number the operator typed in) ────────────────────────
const generateContainerNumber = (typeCode, nvoccCode, used) => {
  let number
  do {
    const suffix = crypto.randomBytes(4).toString('hex').toUpperCase()
    number = `AUTO-${nvoccCode}-${typeCode}-${suffix}`
  } while (used.has(number))
  used.add(number)
  return number
}

export const quickAddStock = async (containerTypeId, nvoccId, depotId, quantity) => {
  const [type, nvocc, depot] = await Promise.all([
    ContainerType.findById(containerTypeId),
    Nvocc.findById(nvoccId),
    Depot.findById(depotId),
  ])
  if (!type) throw Object.assign(new Error('Container type not found'), { statusCode: 404 })
  if (!nvocc) throw Object.assign(new Error('NVOCC not found'), { statusCode: 404 })
  if (!depot) throw Object.assign(new Error('Depot not found'), { statusCode: 404 })

  const used = new Set(
    (await Container.find().select('containerNumber').lean()).map((c) => c.containerNumber)
  )

  const docs = Array.from({ length: quantity }, () => ({
    containerNumber: generateContainerNumber(type.code, nvocc.code, used),
    containerType: containerTypeId,
    nvocc: nvoccId,
    depot: depotId,
  }))

  const created = await Container.insertMany(docs)
  return { createdCount: created.length }
}

export const previewImport = async (rows) => validateRows(rows)

export const commitImport = async (rows) => {
  const validated = await validateRows(rows)
  const toCreate = validated.filter((r) => r.status === 'valid')

  const created = []
  const errors = []
  for (const row of toCreate) {
    try {
      const doc = await Container.create({
        containerNumber: row.containerNumber,
        containerType: row.containerTypeId,
        nvocc: row.nvoccId,
        depot: row.depotId,
      })
      created.push(doc)
    } catch (err) {
      errors.push({ rowNumber: row.rowNumber, message: err.message })
    }
  }

  return {
    createdCount: created.length,
    skippedCount: validated.length - toCreate.length,
    errors,
  }
}

// ─── Booking stock hooks (drop-in replacement for ContainerStock) ─────────────
export const checkStock = async (containerTypeId, requested) => {
  const available = await Container.countDocuments({ containerType: containerTypeId, status: 'available' })
  return { ok: available >= requested, available }
}

// Scoped to the booking's own NVOCC (and, when given, depot) so a confirm
// never allocates a different NVOCC's — or a different depot's — physical
// containers. FIFO by createdAt ascending: the oldest stock in the pool is
// always allocated first ("take the older then the new"). Every allocated
// unit is stamped with `booking` so incrementStock() can later release
// exactly these units, not just "the most recent ones of this type."
export const decrementStock = async (containerTypeId, qty, nvoccId, depotId, bookingId) => {
  const filter = { containerType: containerTypeId, status: 'available' }
  if (nvoccId) filter.nvocc = nvoccId
  if (depotId) filter.depot = depotId
  const docs = await Container.find(filter)
    .sort({ createdAt: 1 })
    .limit(qty)
    .select('_id')
    .lean()
  if (docs.length === 0) return
  await Container.updateMany(
    { _id: { $in: docs.map((d) => d._id) } },
    { status: 'allocated', booking: bookingId, containerStatus: 'Empty Assigned' }
  )
}

// Releases exactly the units this booking holds for this container type —
// precise, not a FIFO/LIFO guess, because decrementStock() stamped `booking`
// on them at allocation time.
export const incrementStock = async (containerTypeId, qty, nvoccId, bookingId) => {
  const filter = { containerType: containerTypeId, status: 'allocated', booking: bookingId }
  if (nvoccId) filter.nvocc = nvoccId
  const docs = await Container.find(filter)
    .sort({ createdAt: 1 })
    .limit(qty)
    .select('_id')
    .lean()
  if (docs.length === 0) return
  await Container.updateMany(
    { _id: { $in: docs.map((d) => d._id) } },
    {
      status: 'available',
      booking: null,
      sealNumber: null,
      guaranteeReceiptStatus: null,
      containerStatus: null,
      gateInDate: null,
      vasUploadStatus: null,
    }
  )
}
