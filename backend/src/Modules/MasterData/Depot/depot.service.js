import Depot from './depot.model.js'
import Container from '../Container/container.model.js'

export const getAllDepots = async (activeOnly = false) => {
  const filter = activeOnly ? { isActive: true } : {}
  return Depot.find(filter).sort({ name: 1 })
}

export const createDepot = async (data) => {
  const depot = new Depot(data)
  return depot.save()
}

export const updateDepot = async (id, data) => {
  const depot = await Depot.findByIdAndUpdate(id, data, { new: true, runValidators: true })
  if (!depot) throw Object.assign(new Error('Depot not found'), { statusCode: 404 })
  return depot
}

export const toggleActive = async (id) => {
  const depot = await Depot.findById(id)
  if (!depot) throw Object.assign(new Error('Depot not found'), { statusCode: 404 })
  depot.isActive = !depot.isActive
  return depot.save()
}

export const deleteDepot = async (id) => {
  const depot = await Depot.findById(id)
  if (!depot) throw Object.assign(new Error('Depot not found'), { statusCode: 404 })
  const usedInStock = await Container.countDocuments({ depot: id })
  if (usedInStock > 0) {
    throw Object.assign(new Error(`Depot has ${usedInStock} container unit(s) in stock`), { statusCode: 409 })
  }
  await depot.deleteOne()
  return depot
}
