import Nvocc from './nvocc.model.js'
import Booking from '../../Export/Booking/booking.model.js'
import Container from '../Container/container.model.js'

export const getAllNvoccs = async (activeOnly = false) => {
  const filter = activeOnly ? { isActive: true } : {}
  return Nvocc.find(filter).sort({ name: 1 })
}

export const createNvocc = async (data) => {
  const nvocc = new Nvocc(data)
  return nvocc.save()
}

export const updateNvocc = async (id, data) => {
  const nvocc = await Nvocc.findByIdAndUpdate(id, data, { new: true, runValidators: true })
  if (!nvocc) throw Object.assign(new Error('NVOCC not found'), { statusCode: 404 })
  return nvocc
}

export const toggleActive = async (id) => {
  const nvocc = await Nvocc.findById(id)
  if (!nvocc) throw Object.assign(new Error('NVOCC not found'), { statusCode: 404 })
  nvocc.isActive = !nvocc.isActive
  return nvocc.save()
}

export const deleteNvocc = async (id) => {
  const nvocc = await Nvocc.findById(id)
  if (!nvocc) throw Object.assign(new Error('NVOCC not found'), { statusCode: 404 })
  const [usedInBookings, usedInStock] = await Promise.all([
    Booking.countDocuments({ nvocc: id }),
    Container.countDocuments({ nvocc: id }),
  ])
  if (usedInBookings > 0) {
    throw Object.assign(new Error(`NVOCC is used by ${usedInBookings} booking(s)`), { statusCode: 409 })
  }
  if (usedInStock > 0) {
    throw Object.assign(new Error(`NVOCC has ${usedInStock} container unit(s) in stock`), { statusCode: 409 })
  }
  await nvocc.deleteOne()
  return nvocc
}
