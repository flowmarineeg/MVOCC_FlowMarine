import mongoose from 'mongoose'
import Container from './container.model.js'
import ContainerType from '../ContainerType/containerType.model.js'
import Nvocc from '../Nvocc/nvocc.model.js'

// Validate + cast to ObjectId explicitly rather than assigning the raw query
// value: aggregate() (unlike find()) never auto-casts, so an un-cast string
// filter silently matches nothing — and an unvalidated value could otherwise
// carry a query operator (e.g. `?containerType[$ne]=x`) straight into a filter.
const buildFilter = ({ containerType, nvocc } = {}) => {
  const filter = {}
  if (containerType && mongoose.Types.ObjectId.isValid(containerType)) {
    filter.containerType = new mongoose.Types.ObjectId(containerType)
  }
  if (nvocc && mongoose.Types.ObjectId.isValid(nvocc)) {
    filter.nvocc = new mongoose.Types.ObjectId(nvocc)
  }
  return filter
}

// ─── Overview: one row per (containerType, nvocc) with available/total counts ─
export const getStockOverview = async ({ containerType, nvocc } = {}) => {
  const match = buildFilter({ containerType, nvocc })
  const rows = await Container.aggregate([
    { $match: match },
    {
      $group: {
        _id: { containerType: '$containerType', nvocc: '$nvocc' },
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
    { $unwind: '$containerType' },
    { $unwind: '$nvocc' },
    {
      $project: {
        _id: 0,
        containerType: { _id: '$containerType._id', code: '$containerType.code', label: '$containerType.label' },
        nvocc: { _id: '$nvocc._id', name: '$nvocc.name', code: '$nvocc.code' },
        total: 1,
        available: 1,
      },
    },
    { $sort: { 'containerType.code': 1, 'nvocc.name': 1 } },
  ])
  return rows
}

// ─── Group detail: full list of individual container units for a filter ──────
export const getContainers = async ({ containerType, nvocc } = {}) => {
  const filter = buildFilter({ containerType, nvocc })
  return Container.find(filter)
    .populate('containerType', 'code label')
    .populate('nvocc', 'name code')
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

// ─── Excel import — preview + commit ─────────────────────────────────────────
// Each raw row: { rowNumber, containerTypeCode, nvoccCode, containerNumber }
// Classifies every row as one of:
//   'invalid'   — empty / missing a field / unknown type or NVOCC code
//   'duplicate' — container number already in stock, or repeated in this file
//   'valid'     — ready to import
// Re-run from scratch on every call (preview AND commit) so commit never
// trusts client-supplied validity — it only trusts the raw cell values.
const validateRows = async (rows) => {
  const typeDocs = await ContainerType.find()
  const nvoccDocs = await Nvocc.find()
  const typeByCode = new Map(typeDocs.map((t) => [t.code.toUpperCase(), t]))
  const nvoccByCode = new Map(nvoccDocs.map((n) => [n.code.toUpperCase(), n]))
  const existingNumbers = new Set(
    (await Container.find().select('containerNumber').lean()).map((c) => c.containerNumber)
  )
  const seenInFile = new Map()

  return rows.map((row) => {
    const { rowNumber, containerTypeCode, nvoccCode, containerNumber } = row
    const base = { rowNumber, containerTypeCode, nvoccCode, containerNumber }

    if (!containerTypeCode && !nvoccCode && !containerNumber) {
      return { ...base, status: 'invalid', message: 'Empty row' }
    }
    if (!containerTypeCode || !nvoccCode || !containerNumber) {
      return { ...base, status: 'invalid', message: 'Missing container type, NVOCC, or container number' }
    }

    const type = typeByCode.get(String(containerTypeCode).trim().toUpperCase())
    if (!type) {
      return { ...base, status: 'invalid', message: `Unknown container type code "${containerTypeCode}"` }
    }
    const nvocc = nvoccByCode.get(String(nvoccCode).trim().toUpperCase())
    if (!nvocc) {
      return { ...base, status: 'invalid', message: `Unknown NVOCC code "${nvoccCode}"` }
    }

    const number = String(containerNumber).trim().toUpperCase()
    if (existingNumbers.has(number)) {
      return {
        ...base, containerNumber: number, containerTypeLabel: type.label, nvoccName: nvocc.name,
        status: 'duplicate', message: `Container number "${number}" already exists in stock`,
      }
    }
    if (seenInFile.has(number)) {
      return {
        ...base, containerNumber: number, containerTypeLabel: type.label, nvoccName: nvocc.name,
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
      status: 'valid',
      message: 'Ready to import',
    }
  })
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

// Scoped to the booking's own NVOCC when known (Step 2+) so a confirm never
// allocates a different NVOCC's physical containers — units are registered
// per (containerType, nvocc), and the per-NVOCC stock overview depends on
// that ownership staying accurate. Falls back to type-only before the NVOCC
// is chosen (Step 1 stock check has no NVOCC yet).
export const decrementStock = async (containerTypeId, qty, nvoccId) => {
  const filter = { containerType: containerTypeId, status: 'available' }
  if (nvoccId) filter.nvocc = nvoccId
  const docs = await Container.find(filter)
    .sort({ createdAt: 1 })
    .limit(qty)
    .select('_id')
    .lean()
  if (docs.length === 0) return
  await Container.updateMany({ _id: { $in: docs.map((d) => d._id) } }, { status: 'allocated' })
}

export const incrementStock = async (containerTypeId, qty, nvoccId) => {
  const filter = { containerType: containerTypeId, status: 'allocated' }
  if (nvoccId) filter.nvocc = nvoccId
  const docs = await Container.find(filter)
    .sort({ updatedAt: -1 })
    .limit(qty)
    .select('_id')
    .lean()
  if (docs.length === 0) return
  await Container.updateMany({ _id: { $in: docs.map((d) => d._id) } }, { status: 'available' })
}
