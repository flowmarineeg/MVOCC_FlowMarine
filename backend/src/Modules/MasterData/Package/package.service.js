import Package from './package.model.js'

export const getAllPackages = async ({ activeOnly } = {}) => {
  const filter = activeOnly ? { isActive: true } : {}
  return Package.find(filter).sort({ name: 1 })
}

export const createPackage = async (data) => new Package(data).save()

export const updatePackage = async (id, data) => {
  const pkg = await Package.findByIdAndUpdate(id, data, { new: true, runValidators: true })
  if (!pkg) throw Object.assign(new Error('Package not found'), { statusCode: 404 })
  return pkg
}

export const toggleActive = async (id) => {
  const pkg = await Package.findById(id)
  if (!pkg) throw Object.assign(new Error('Package not found'), { statusCode: 404 })
  pkg.isActive = !pkg.isActive
  return pkg.save()
}

// Booking.packageType is free text today, so nothing references a Package.
export const deletePackage = async (id) => {
  const pkg = await Package.findById(id)
  if (!pkg) throw Object.assign(new Error('Package not found'), { statusCode: 404 })
  await pkg.deleteOne()
  return pkg
}
