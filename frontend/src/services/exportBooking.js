import api from './api.js'

export const getBookings = (params = {}) =>
  api.get('/export/bookings', { params }).then((r) => r.data)

export const getBookingById = (id) =>
  api.get(`/export/bookings/${id}`).then((r) => r.data.data)

export const createBooking = (data) =>
  api.post('/export/bookings', data).then((r) => r.data)

export const updateBooking = (id, data) =>
  api.put(`/export/bookings/${id}`, data).then((r) => r.data)

export const getConfirmationFileUrl = (id) =>
  `${api.defaults.baseURL}/export/bookings/${id}/confirmation-file`

export const confirmBooking = (id) =>
  api.put(`/export/bookings/${id}/confirm`).then((r) => r.data.data)

export const cancelBooking = (id) =>
  api.put(`/export/bookings/${id}/cancel`).then((r) => r.data.data)

export const deleteBooking = (id) =>
  api.delete(`/export/bookings/${id}`).then((r) => r.data)

export const getPreview = (params = {}) =>
  api.get('/export/bookings/preview', { params }).then((r) => r.data)

export const exportExcel = async (params = {}) => {
  const res = await api.get('/export/bookings/export-excel', {
    params,
    responseType: 'blob',
  })
  const url = window.URL.createObjectURL(new Blob([res.data]))
  const link = document.createElement('a')
  link.href = url
  const date = new Date().toISOString().split('T')[0]
  link.setAttribute('download', `export-bookings-${date}.xlsx`)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

// MSDS files attached to the booking's quotation (DG attachments).
export const downloadMsds = async (bookingId, file) => {
  const res = await api.get(`/export/bookings/${bookingId}/msds/${file._id}`, { responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([res.data]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', file.fileName)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

// ─── Sprint 007 — step engine, roll-over, reconciliation ─────────────────────
// The booking / B&L responses carry `state` next to `data` (per-step issues, warnings,
// reconciliation, lifecycle stage). These helpers return both.
export const getJob = (id) =>
  api.get(`/export/bookings/${id}`).then((r) => ({ data: r.data.data, state: r.data.state }))

export const completeStep = (id, step) =>
  api.post(`/export/bookings/${id}/steps/${step}/complete`).then((r) => r.data)

export const reopenStep = (id, step, reason) =>
  api.post(`/export/bookings/${id}/steps/${step}/reopen`, { reason }).then((r) => r.data)

export const rollBooking = (id, reason) =>
  api.post(`/export/bookings/${id}/roll`, { reason }).then((r) => r.data)

export const getReconciliation = (id) =>
  api.get(`/export/bookings/${id}/reconciliation`).then((r) => r.data.data)
