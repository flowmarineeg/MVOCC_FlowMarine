import Vessel from './vessel.model.js'

export const getAllVessels = async (activeOnly = false) => {
  const filter = activeOnly ? { isActive: true } : {}
  return Vessel.find(filter).sort({ name: 1 })
}

export const createVessel = async (data) => {
  const vessel = new Vessel(data)
  return vessel.save()
}

export const updateVessel = async (id, data) => {
  const vessel = await Vessel.findByIdAndUpdate(id, data, { new: true, runValidators: true })
  if (!vessel) throw Object.assign(new Error('Vessel not found'), { statusCode: 404 })
  return vessel
}

export const toggleActive = async (id) => {
  const vessel = await Vessel.findById(id)
  if (!vessel) throw Object.assign(new Error('Vessel not found'), { statusCode: 404 })
  vessel.isActive = !vessel.isActive
  return vessel.save()
}
