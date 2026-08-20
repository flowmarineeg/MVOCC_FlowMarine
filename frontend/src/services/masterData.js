import api from './api.js'

export const getContainerTypes = (activeOnly = true) =>
  api.get('/master/container-types', { params: { active: activeOnly } }).then((r) => r.data.data)
export const createContainerType = (data) => api.post('/master/container-types', data).then((r) => r.data.data)
export const updateContainerType = (id, data) => api.put(`/master/container-types/${id}`, data).then((r) => r.data.data)
export const toggleContainerType = (id) => api.patch(`/master/container-types/${id}/toggle`).then((r) => r.data.data)

export const getVessels = (activeOnly = true) =>
  api.get('/master/vessels', { params: { active: activeOnly } }).then((r) => r.data.data)
export const createVessel = (data) => api.post('/master/vessels', data).then((r) => r.data.data)
export const updateVessel = (id, data) => api.put(`/master/vessels/${id}`, data).then((r) => r.data.data)
export const toggleVessel = (id) => api.patch(`/master/vessels/${id}/toggle`).then((r) => r.data.data)

export const getPorts = (activeOnly = true) =>
  api.get('/master/ports', { params: { active: activeOnly } }).then((r) => r.data.data)
export const createPort = (data) => api.post('/master/ports', data).then((r) => r.data.data)
export const updatePort = (id, data) => api.put(`/master/ports/${id}`, data).then((r) => r.data.data)
export const togglePort = (id) => api.patch(`/master/ports/${id}/toggle`).then((r) => r.data.data)

export const getAgents = (type = null, activeOnly = true) =>
  api.get('/master/agents', { params: { ...(type && { type }), active: activeOnly } }).then((r) => r.data.data)

export const getContainerStock = () =>
  api.get('/master/container-stock').then((r) => r.data.data)
export const updateContainerStock = (typeId, availableCount) =>
  api.put(`/master/container-stock/${typeId}`, { availableCount }).then((r) => r.data.data)
