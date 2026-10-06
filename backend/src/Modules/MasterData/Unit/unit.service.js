import Unit, { UNIT_TYPES } from './unit.model.js'

export const getAllUnits = async ({ activeOnly, query = {} } = {}) => {
  const filter = activeOnly ? { isActive: true } : {}
  if (UNIT_TYPES.includes(query.type)) filter.type = query.type
  return Unit.find(filter).sort({ type: 1, name: 1 })
}

export const createUnit = async (data) => new Unit(data).save()

export const updateUnit = async (id, data) => {
  const unit = await Unit.findByIdAndUpdate(id, data, { new: true, runValidators: true })
  if (!unit) throw Object.assign(new Error('Unit not found'), { statusCode: 404 })
  return unit
}

export const toggleActive = async (id) => {
  const unit = await Unit.findById(id)
  if (!unit) throw Object.assign(new Error('Unit not found'), { statusCode: 404 })
  unit.isActive = !unit.isActive
  return unit.save()
}

// Booking weights/dimensions have fixed units today, so nothing references a Unit.
export const deleteUnit = async (id) => {
  const unit = await Unit.findById(id)
  if (!unit) throw Object.assign(new Error('Unit not found'), { statusCode: 404 })
  await unit.deleteOne()
  return unit
}
