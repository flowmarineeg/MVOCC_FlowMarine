import ContainerType from './containerType.model.js'
import Container from '../Container/container.model.js'
import Booking from '../../Export/Booking/booking.model.js'

export const getAllContainerTypes = async (activeOnly = false) => {
  const filter = activeOnly ? { isActive: true } : {}
  return ContainerType.find(filter).sort({ code: 1 })
}

export const getContainerTypeById = async (id) => {
  const ct = await ContainerType.findById(id)
  if (!ct) throw Object.assign(new Error('Container type not found'), { statusCode: 404 })
  return ct
}

export const createContainerType = async (data) => {
  const ct = new ContainerType(data)
  return ct.save()
}

export const updateContainerType = async (id, data) => {
  const ct = await ContainerType.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  })
  if (!ct) throw Object.assign(new Error('Container type not found'), { statusCode: 404 })
  return ct
}

export const toggleActive = async (id) => {
  const ct = await ContainerType.findById(id)
  if (!ct) throw Object.assign(new Error('Container type not found'), { statusCode: 404 })
  ct.isActive = !ct.isActive
  return ct.save()
}

export const deleteContainerType = async (id) => {
  const ct = await ContainerType.findById(id)
  if (!ct) throw Object.assign(new Error('Container type not found'), { statusCode: 404 })
  const [usedInBookings, usedInStock] = await Promise.all([
    Booking.countDocuments({ 'containers.containerType': id }),
    Container.countDocuments({ containerType: id }),
  ])
  if (usedInBookings > 0) {
    throw Object.assign(new Error(`Container type is used by ${usedInBookings} booking(s)`), { statusCode: 409 })
  }
  if (usedInStock > 0) {
    throw Object.assign(new Error(`Container type has ${usedInStock} container unit(s) in stock`), { statusCode: 409 })
  }
  await ct.deleteOne()
  return ct
}
