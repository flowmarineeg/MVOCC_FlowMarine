import api from './api.js'

export const getBookings = (params = {}) =>
  api.get('/export/bookings', { params }).then((r) => r.data)

export const getBookingById = (id) =>
  api.get(`/export/bookings/${id}`).then((r) => r.data.data)

export const createBooking = (data) =>
  api.post('/export/bookings', data).then((r) => r.data)

export const updateStep2 = (id, data) =>
  api.put(`/export/bookings/${id}/step2`, data).then((r) => r.data.data)

export const confirmBooking = (id) =>
  api.put(`/export/bookings/${id}/confirm`).then((r) => r.data.data)

export const cancelBooking = (id) =>
  api.put(`/export/bookings/${id}/cancel`).then((r) => r.data.data)

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
