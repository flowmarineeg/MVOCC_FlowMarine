import Port from './port.model.js'
import Booking from '../../Export/Booking/booking.model.js'

export const getAllPorts = async (activeOnly = false) => {
  const filter = activeOnly ? { isActive: true } : {}
  return Port.find(filter).sort({ name: 1 })
}

export const createPort = async (data) => {
  const port = new Port(data)
  return port.save()
}

export const updatePort = async (id, data) => {
  const port = await Port.findByIdAndUpdate(id, data, { new: true, runValidators: true })
  if (!port) throw Object.assign(new Error('Port not found'), { statusCode: 404 })
  return port
}

export const toggleActive = async (id) => {
  const port = await Port.findById(id)
  if (!port) throw Object.assign(new Error('Port not found'), { statusCode: 404 })
  port.isActive = !port.isActive
  return port.save()
}

export const deletePort = async (id) => {
  const port = await Port.findById(id)
  if (!port) throw Object.assign(new Error('Port not found'), { statusCode: 404 })
  const usedInBookings = await Booking.countDocuments({ $or: [{ pol: id }, { pod: id }] })
  if (usedInBookings > 0) {
    throw Object.assign(new Error(`Port is used by ${usedInBookings} booking(s)`), { statusCode: 409 })
  }
  await port.deleteOne()
  return port
}
