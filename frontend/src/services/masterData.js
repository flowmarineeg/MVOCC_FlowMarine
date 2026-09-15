import api from './api.js'

export const getContainerTypes = (activeOnly = true) =>
  api.get('/master/container-types', { params: { active: activeOnly } }).then((r) => r.data.data)
export const createContainerType = (data) => api.post('/master/container-types', data).then((r) => r.data.data)
export const updateContainerType = (id, data) => api.put(`/master/container-types/${id}`, data).then((r) => r.data.data)
export const toggleContainerType = (id) => api.patch(`/master/container-types/${id}/toggle`).then((r) => r.data.data)
export const deleteContainerType = (id) => api.delete(`/master/container-types/${id}`).then((r) => r.data)

export const getCarriers = (activeOnly = true) =>
  api.get('/master/carriers', { params: { active: activeOnly } }).then((r) => r.data.data)
export const createCarrier = (data) => api.post('/master/carriers', data).then((r) => r.data.data)
export const updateCarrier = (id, data) => api.put(`/master/carriers/${id}`, data).then((r) => r.data.data)
export const toggleCarrier = (id) => api.patch(`/master/carriers/${id}/toggle`).then((r) => r.data.data)
export const deleteCarrier = (id) => api.delete(`/master/carriers/${id}`).then((r) => r.data)

export const getNvoccs = (activeOnly = true) =>
  api.get('/master/nvoccs', { params: { active: activeOnly } }).then((r) => r.data.data)
export const createNvocc = (data) => api.post('/master/nvoccs', data).then((r) => r.data.data)
export const updateNvocc = (id, data) => api.put(`/master/nvoccs/${id}`, data).then((r) => r.data.data)
export const toggleNvocc = (id) => api.patch(`/master/nvoccs/${id}/toggle`).then((r) => r.data.data)
export const deleteNvocc = (id) => api.delete(`/master/nvoccs/${id}`).then((r) => r.data)

export const getDepots = (activeOnly = true) =>
  api.get('/master/depots', { params: { active: activeOnly } }).then((r) => r.data.data)
export const createDepot = (data) => api.post('/master/depots', data).then((r) => r.data.data)
export const updateDepot = (id, data) => api.put(`/master/depots/${id}`, data).then((r) => r.data.data)
export const toggleDepot = (id) => api.patch(`/master/depots/${id}/toggle`).then((r) => r.data.data)
export const deleteDepot = (id) => api.delete(`/master/depots/${id}`).then((r) => r.data)

export const getPorts = (activeOnly = true) =>
  api.get('/master/ports', { params: { active: activeOnly } }).then((r) => r.data.data)
export const createPort = (data) => api.post('/master/ports', data).then((r) => r.data.data)
export const updatePort = (id, data) => api.put(`/master/ports/${id}`, data).then((r) => r.data.data)
export const togglePort = (id) => api.patch(`/master/ports/${id}/toggle`).then((r) => r.data.data)
export const deletePort = (id) => api.delete(`/master/ports/${id}`).then((r) => r.data)

export const getAgents = (type = null, activeOnly = true) =>
  api.get('/master/agents', { params: { ...(type && { type }), active: activeOnly } }).then((r) => r.data.data)

export const getCustomers = (activeOnly = true) =>
  api.get('/master/customers', { params: { active: activeOnly } }).then((r) => r.data.data)
export const createCustomer = (data) => api.post('/master/customers', data).then((r) => r.data.data)
export const updateCustomer = (id, data) => api.put(`/master/customers/${id}`, data).then((r) => r.data.data)
export const toggleCustomer = (id) => api.patch(`/master/customers/${id}/toggle`).then((r) => r.data.data)
export const deleteCustomer = (id) => api.delete(`/master/customers/${id}`).then((r) => r.data)

// Shared between the Master Data "Customers" tab and the Quotation form's
// inline "+ New Client" popup so both stay in sync with one field list.
export const CUSTOMER_FORM_FIELDS = [
  { key: 'date', label: 'Date', type: 'date', required: false },
  { key: 'name', label: 'Name' },
  { key: 'address', label: 'Address', required: false },
  { key: 'phone', label: 'Phone', required: false },
  { key: 'email', label: 'Email', type: 'email', required: false },
  { key: 'taxNumber', label: 'Tax Number', required: false },
  { key: 'taxRegister', label: 'Tax Register', required: false },
]
