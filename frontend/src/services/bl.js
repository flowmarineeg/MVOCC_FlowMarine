import api from './api.js'

export const getBlJobs = (params = {}) =>
  api.get('/export/bookings/bl', { params }).then((r) => r.data)

export const getBlById = (id) =>
  api.get(`/export/bookings/${id}/bl`).then((r) => r.data.data)

export const updateBl = (id, data) =>
  api.put(`/export/bookings/${id}/bl`, data).then((r) => r.data.data)

export const getCustomsCertificateFileUrl = (id) =>
  `${api.defaults.baseURL}/export/bookings/${id}/bl/customs-certificate-file`

// ─── Sprint 007 — Steps 4 & 5 ────────────────────────────────────────────────
export const getBl = (id) =>
  api.get(`/export/bookings/${id}/bl`).then((r) => ({ data: r.data.data, state: r.data.state }))

export const saveBl = (id, data) =>
  api.put(`/export/bookings/${id}/bl`, data).then((r) => ({ data: r.data.data, state: r.data.state }))

export const getActionStates = (id) =>
  api.get(`/export/bookings/${id}/bl/actions`).then((r) => r.data.data)

const post = (id, path, body) => api.post(`/export/bookings/${id}/bl/${path}`, body).then((r) => r.data)
export const generateDraft = (id, note) => post(id, 'draft', { note })
export const issueHbl = (id) => post(id, 'issue')
export const reissueHbl = (id, reason) => post(id, 'reissue', { reason })
export const sendPreAlert = (id) => post(id, 'pre-alert')
export const ackPreAlert = (id) => post(id, 'pre-alert/ack')

const download = async (id, path, fallbackName) => {
  const res = await api.get(`/export/bookings/${id}/bl/${path}`, { responseType: 'blob' })
  const match = /filename="?([^";]+)"?/.exec(res.headers['content-disposition'] || '')
  const url = window.URL.createObjectURL(new Blob([res.data]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', match?.[1] || fallbackName)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
export const downloadLoadingList = (id) => download(id, 'loading-list.xlsx', 'loading-list.xlsx')
export const downloadDgManifest = (id) => download(id, 'dg-manifest.pdf', 'dg-manifest.pdf')
export const downloadHbl = (id) => download(id, 'hbl.pdf', 'hbl.pdf')
export const downloadDraftHbl = (id) => download(id, 'draft.pdf', 'draft-bl.pdf')
