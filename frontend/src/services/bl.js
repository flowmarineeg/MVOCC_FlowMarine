import api from './api.js'

export const getBlJobs = (params = {}) =>
  api.get('/export/bookings/bl', { params }).then((r) => r.data)

export const getBlById = (id) =>
  api.get(`/export/bookings/${id}/bl`).then((r) => r.data.data)

export const updateBl = (id, data) =>
  api.put(`/export/bookings/${id}/bl`, data).then((r) => r.data.data)

export const getCustomsCertificateFileUrl = (id) =>
  `${api.defaults.baseURL}/export/bookings/${id}/bl/customs-certificate-file`
