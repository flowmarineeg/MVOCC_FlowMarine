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

// MSDS (dangerous goods) files — uploaded after the quotation is saved.
export const MSDS_MAX_FILES = 5

export const uploadMsds = (id, files) => {
  const fd = new FormData()
  files.forEach((f) => fd.append('msds', f))
  return api.post(`/export/quotations/${id}/msds`, fd).then((r) => r.data.data)
}

export const deleteMsds = (id, fileId) =>
  api.delete(`/export/quotations/${id}/msds/${fileId}`).then((r) => r.data.data)

export const downloadMsds = async (id, file) => {
  const res = await api.get(`/export/quotations/${id}/msds/${file._id}`, { responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([res.data]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', file.fileName)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
