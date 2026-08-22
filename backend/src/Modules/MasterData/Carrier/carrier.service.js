import Carrier from './carrier.model.js'
import Booking from '../../Export/Booking/booking.model.js'

export const getAllCarriers = async (activeOnly = false) => {
  const filter = activeOnly ? { isActive: true } : {}
  return Carrier.find(filter).sort({ name: 1 })
}

export const createCarrier = async (data) => {
  const carrier = new Carrier(data)
  return carrier.save()
}

export const updateCarrier = async (id, data) => {
  const carrier = await Carrier.findByIdAndUpdate(id, data, { new: true, runValidators: true })
  if (!carrier) throw Object.assign(new Error('Carrier not found'), { statusCode: 404 })
  return carrier
}

export const toggleActive = async (id) => {
  const carrier = await Carrier.findById(id)
  if (!carrier) throw Object.assign(new Error('Carrier not found'), { statusCode: 404 })
  carrier.isActive = !carrier.isActive
  return carrier.save()
}

export const deleteCarrier = async (id) => {
  const carrier = await Carrier.findById(id)
  if (!carrier) throw Object.assign(new Error('Carrier not found'), { statusCode: 404 })
  const usedInBookings = await Booking.countDocuments({ carrier: id })
  if (usedInBookings > 0) {
    throw Object.assign(new Error(`Carrier is used by ${usedInBookings} booking(s)`), { statusCode: 409 })
  }
  await carrier.deleteOne()
  return carrier
}
