import api from './api.js'

export const login = (data) => api.post('/auth/login', data).then((r) => r.data.data)
export const logout = () => api.post('/auth/logout').then((r) => r.data)
export const getMe = () => api.get('/auth/me').then((r) => r.data.data)
export const forgotPassword = (data) => api.post('/auth/forgot-password', data).then((r) => r.data)
export const resetPassword = (token, data) => api.post(`/auth/reset-password/${token}`, data).then((r) => r.data)
export const changePassword = (data) => api.post('/auth/change-password', data).then((r) => r.data)
