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

export const getAgents = (activeOnly = true) =>
  api.get('/master/agents', { params: { active: activeOnly } }).then((r) => r.data.data)
export const createAgent = (data) => api.post('/master/agents', data).then((r) => r.data.data)
export const updateAgent = (id, data) => api.put(`/master/agents/${id}`, data).then((r) => r.data.data)
export const toggleAgent = (id) => api.patch(`/master/agents/${id}/toggle`).then((r) => r.data.data)
export const deleteAgent = (id) => api.delete(`/master/agents/${id}`).then((r) => r.data)

export const getVesselOperators = (activeOnly = true) =>
  api.get('/master/vessel-operators', { params: { active: activeOnly } }).then((r) => r.data.data)
export const createVesselOperator = (data) => api.post('/master/vessel-operators', data).then((r) => r.data.data)
export const updateVesselOperator = (id, data) => api.put(`/master/vessel-operators/${id}`, data).then((r) => r.data.data)
export const toggleVesselOperator = (id) => api.patch(`/master/vessel-operators/${id}/toggle`).then((r) => r.data.data)
export const deleteVesselOperator = (id) => api.delete(`/master/vessel-operators/${id}`).then((r) => r.data)

export const getVessels = (activeOnly = true) =>
  api.get('/master/vessels', { params: { active: activeOnly } }).then((r) => r.data.data)
export const createVessel = (data) => api.post('/master/vessels', data).then((r) => r.data.data)
export const updateVessel = (id, data) => api.put(`/master/vessels/${id}`, data).then((r) => r.data.data)
export const toggleVessel = (id) => api.patch(`/master/vessels/${id}/toggle`).then((r) => r.data.data)
export const deleteVessel = (id) => api.delete(`/master/vessels/${id}`).then((r) => r.data)

export const getPackages = (activeOnly = true) =>
  api.get('/master/packages', { params: { active: activeOnly } }).then((r) => r.data.data)
export const createPackage = (data) => api.post('/master/packages', data).then((r) => r.data.data)
export const updatePackage = (id, data) => api.put(`/master/packages/${id}`, data).then((r) => r.data.data)
export const togglePackage = (id) => api.patch(`/master/packages/${id}/toggle`).then((r) => r.data.data)
export const deletePackage = (id) => api.delete(`/master/packages/${id}`).then((r) => r.data)

export const getUnits = (activeOnly = true) =>
  api.get('/master/units', { params: { active: activeOnly } }).then((r) => r.data.data)
export const createUnit = (data) => api.post('/master/units', data).then((r) => r.data.data)
export const updateUnit = (id, data) => api.put(`/master/units/${id}`, data).then((r) => r.data.data)
export const toggleUnit = (id) => api.patch(`/master/units/${id}/toggle`).then((r) => r.data.data)
export const deleteUnit = (id) => api.delete(`/master/units/${id}`).then((r) => r.data)

export const getParties = (activeOnly = true) =>
  api.get('/master/parties', { params: { active: activeOnly } }).then((r) => r.data.data)
export const createParty = (data) => api.post('/master/parties', data).then((r) => r.data.data)
export const updateParty = (id, data) => api.put(`/master/parties/${id}`, data).then((r) => r.data.data)
export const toggleParty = (id) => api.patch(`/master/parties/${id}/toggle`).then((r) => r.data.data)
export const deleteParty = (id) => api.delete(`/master/parties/${id}`).then((r) => r.data)

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
  { key: 'address', label: 'Address', required: false, table: false },
  { key: 'country', label: 'Country', type: 'country', required: false },
  { key: 'governorate', label: 'Governorate', type: 'governorate', countryKey: 'country', required: false },
  { key: 'phone', label: 'Phone', required: false },
  { key: 'email', label: 'Email', type: 'email', required: false },
  { key: 'taxNumber', label: 'Tax Number', required: false },
  { key: 'taxRegister', label: 'Tax Register', required: false },
  { key: 'contacts', label: 'Contacts', type: 'contacts' },
]

// Shared by NVOCC, VO, Depot, Agent and Parties: identity + tax/registration +
// contract validity + contact rows. Mirrors backend _shared/party.shared.js.
export const partyFormFields = ({ codeLabel = 'Code' } = {}) => [
  { key: 'name', label: 'Name' },
  { key: 'code', label: codeLabel },
  { key: 'address', label: 'Address', required: false, table: false },
  { key: 'taxNumber', label: 'Tax Number', required: false },
  { key: 'registrationNumber', label: 'Registration Number', required: false, table: false },
  { key: 'contractType', label: 'Contract Type', type: 'select', options: ['Contract', 'Spot'], required: false },
  { key: 'contractValidFrom', label: 'Valid From', type: 'date', required: false },
  { key: 'contractValidTo', label: 'Valid To', type: 'date', required: false },
  { key: 'contacts', label: 'Contacts', type: 'contacts' },
]
