import ContainerStock from './containerStock.model.js'

export const getAllStock = async () => {
  return ContainerStock.find().populate('containerType').sort({ 'containerType.code': 1 })
}

export const getStockByTypeId = async (containerTypeId) => {
  return ContainerStock.findOne({ containerType: containerTypeId }).populate('containerType')
}

export const updateStock = async (containerTypeId, availableCount) => {
  const stock = await ContainerStock.findOneAndUpdate(
    { containerType: containerTypeId },
    { availableCount },
    { new: true, runValidators: true, upsert: true }
  ).populate('containerType')
  return stock
}

export const checkStock = async (containerTypeId, requested) => {
  const stock = await ContainerStock.findOne({ containerType: containerTypeId })
  const available = stock ? stock.availableCount : 0
  return { ok: available >= requested, available }
}

export const decrementStock = async (containerTypeId, qty) => {
  const stock = await ContainerStock.findOne({ containerType: containerTypeId })
  if (!stock) throw Object.assign(new Error('Stock record not found'), { statusCode: 404 })
  stock.availableCount = Math.max(0, stock.availableCount - qty)
  return stock.save()
}

export const incrementStock = async (containerTypeId, qty) => {
  const stock = await ContainerStock.findOne({ containerType: containerTypeId })
  if (!stock) throw Object.assign(new Error('Stock record not found'), { statusCode: 404 })
  stock.availableCount += qty
  return stock.save()
}
