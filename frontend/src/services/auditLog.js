import api from './api.js'

export const getAuditLogs = (params = {}) => api.get('/audit-logs', { params }).then((r) => r.data)
export const getAuditLogById = (id) => api.get(`/audit-logs/${id}`).then((r) => r.data.data)
