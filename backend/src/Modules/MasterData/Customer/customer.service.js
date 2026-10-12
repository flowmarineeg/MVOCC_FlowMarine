import fs from 'fs'
import path from 'path'
import Customer from './customer.model.js'

// kind (URL segment) -> schema field
export const CERT_FIELDS = { tax: 'taxCertificateFile', registration: 'registrationCertificateFile' }
const CERT_DIR = path.join(process.cwd(), 'uploads', 'customer-certificates')
const certDiskPath = (file) => path.join(CERT_DIR, path.basename(file.filePath))
const removeFromDisk = (file) => file?.filePath && fs.unlink(certDiskPath(file), () => {})

// The certificate fields can only be set by an upload, never from a JSON body.
const stripCertFields = (data = {}) => {
  const { taxCertificateFile, registrationCertificateFile, ...rest } = data
  return rest
}

export const getAllCustomers = async (activeOnly = false) => {
  const filter = activeOnly ? { isActive: true } : {}
  return Customer.find(filter).sort({ name: 1 })
}

export const createCustomer = async (data) => {
  const customer = new Customer(stripCertFields(data))
  return customer.save()
}

export const updateCustomer = async (id, data) => {
  const customer = await Customer.findByIdAndUpdate(id, stripCertFields(data), { new: true, runValidators: true })
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
  Object.values(CERT_FIELDS).forEach((f) => removeFromDisk(customer[f]))
  await customer.deleteOne()
  return customer
}

// ─── Certificates ────────────────────────────────────────────────────────
const certField = (kind) => {
  const field = CERT_FIELDS[kind]
  if (!field) throw Object.assign(new Error('Certificate kind must be "tax" or "registration"'), { statusCode: 400 })
  return field
}

export const setCertificate = async (id, kind, file) => {
  try {
    const field = certField(kind)
    const customer = await Customer.findById(id)
    if (!customer) throw Object.assign(new Error('Customer not found'), { statusCode: 404 })
    removeFromDisk(customer[field]) // replacing: drop the previous file
    customer[field] = { fileName: file.originalname, filePath: file.filename, mimeType: file.mimetype, uploadedAt: new Date() }
    await customer.save()
    return customer
  } catch (err) {
    fs.unlink(file.path, () => {})
    throw err
  }
}

export const removeCertificate = async (id, kind) => {
  const field = certField(kind)
  const customer = await Customer.findById(id)
  if (!customer) throw Object.assign(new Error('Customer not found'), { statusCode: 404 })
  removeFromDisk(customer[field])
  customer[field] = undefined
  await customer.save()
  return customer
}

export const getCertificate = async (id, kind) => {
  const field = certField(kind)
  const customer = await Customer.findById(id)
  const file = customer?.[field]
  if (!file?.filePath) throw Object.assign(new Error('No certificate on file'), { statusCode: 404 })
  return { path: certDiskPath(file), fileName: file.fileName }
}
