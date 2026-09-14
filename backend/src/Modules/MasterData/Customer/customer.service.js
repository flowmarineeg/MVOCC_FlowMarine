import Customer from './customer.model.js'

export const getAllCustomers = async (activeOnly = false) => {
  const filter = activeOnly ? { isActive: true } : {}
  return Customer.find(filter).sort({ name: 1 })
}

export const createCustomer = async (data) => {
  const customer = new Customer(data)
  return customer.save()
}

export const updateCustomer = async (id, data) => {
  const customer = await Customer.findByIdAndUpdate(id, data, { new: true, runValidators: true })
  if (!customer) throw Object.assign(new Error('Customer not found'), { statusCode: 404 })
  return customer
}

export const toggleActive = async (id) => {
  const customer = await Customer.findById(id)
  if (!customer) throw Object.assign(new Error('Customer not found'), { statusCode: 404 })
  customer.isActive = !customer.isActive
  return customer.save()
}

export const deleteCustomer = async (id) => {
  const customer = await Customer.findById(id)
  if (!customer) throw Object.assign(new Error('Customer not found'), { statusCode: 404 })
  await customer.deleteOne()
  return customer
}
