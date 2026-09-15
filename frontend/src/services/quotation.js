import api from './api.js'

export const getQuotations = (params = {}) =>
  api.get('/export/quotations', { params }).then((r) => r.data)

export const getQuotationById = (id) =>
  api.get(`/export/quotations/${id}`).then((r) => r.data.data)

export const createQuotation = (data) =>
  api.post('/export/quotations', data).then((r) => r.data)

export const updateQuotation = (id, data) =>
  api.put(`/export/quotations/${id}`, data).then((r) => r.data.data)

export const updateStatus = (id, data) =>
  api.put(`/export/quotations/${id}/status`, data).then((r) => r.data.data)

export const suggestRate = (nvoccId, excludeId) =>
  api.get('/export/quotations/suggest-rate', { params: { nvocc: nvoccId, excludeId } }).then((r) => r.data.data)
