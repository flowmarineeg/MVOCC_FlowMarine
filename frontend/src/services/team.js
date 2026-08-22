import api from './api.js'

export const inviteMember = (data) => api.post('/team/invite', data).then((r) => r.data.data)
export const getMembers = (params = {}) => api.get('/team/members', { params }).then((r) => r.data)
export const getMemberById = (id) => api.get(`/team/members/${id}`).then((r) => r.data.data)
export const updateMemberRole = (id, data) => api.put(`/team/members/${id}/role`, data).then((r) => r.data.data)
export const deactivateMember = (id) => api.patch(`/team/members/${id}/deactivate`).then((r) => r.data.data)
export const reactivateMember = (id) => api.patch(`/team/members/${id}/reactivate`).then((r) => r.data.data)
export const deleteMember = (id) => api.delete(`/team/members/${id}`).then((r) => r.data)

export const getInvitations = (params = {}) => api.get('/team/invitations', { params }).then((r) => r.data)
export const resendInvitation = (id) => api.post(`/team/invitations/${id}/resend`).then((r) => r.data.data)
export const revokeInvitation = (id) => api.delete(`/team/invitations/${id}`).then((r) => r.data)

export const getInvitationByToken = (token) => api.get(`/invitations/${token}`).then((r) => r.data.data)
export const acceptInvitation = (token, data) => api.post(`/invitations/${token}/accept`, data).then((r) => r.data.data)
export const refuseInvitation = (token) => api.post(`/invitations/${token}/refuse`).then((r) => r.data)
