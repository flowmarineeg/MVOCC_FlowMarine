import ContainerType from './containerType.model.js'

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
