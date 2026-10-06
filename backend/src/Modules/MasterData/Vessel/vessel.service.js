import mongoose from 'mongoose'
import Vessel from './vessel.model.js'

const POPULATE = { path: 'vesselOperator', select: 'name code' }

export const getAllVessels = async ({ activeOnly, query = {} } = {}) => {
  const filter = activeOnly ? { isActive: true } : {}
  // Whitelisted: only a real ObjectId string may reach the filter.
  if (typeof query.vesselOperator === 'string' && mongoose.Types.ObjectId.isValid(query.vesselOperator)) {
    filter.vesselOperator = query.vesselOperator
  }
  return Vessel.find(filter).populate(POPULATE).sort({ name: 1 })
}

export const createVessel = async (data) => {
  const vessel = await new Vessel(data).save()
  return vessel.populate(POPULATE)
}

export const updateVessel = async (id, data) => {
  const vessel = await Vessel.findByIdAndUpdate(id, data, { new: true, runValidators: true }).populate(POPULATE)
  if (!vessel) throw Object.assign(new Error('Vessel not found'), { statusCode: 404 })
  return vessel
}

export const toggleActive = async (id) => {
  const vessel = await Vessel.findById(id)
  if (!vessel) throw Object.assign(new Error('Vessel not found'), { statusCode: 404 })
  vessel.isActive = !vessel.isActive
  await vessel.save()
  return vessel.populate(POPULATE)
}

// Nothing references Vessel yet (Booking.vesselName is free text).
export const deleteVessel = async (id) => {
  const vessel = await Vessel.findById(id)
  if (!vessel) throw Object.assign(new Error('Vessel not found'), { statusCode: 404 })
  await vessel.deleteOne()
  return vessel
}
