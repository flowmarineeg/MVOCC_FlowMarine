import api from './api.js'

export const getStockOverview = ({ containerType, nvocc, depot } = {}) =>
  api.get('/master/containers/overview', { params: { containerType, nvocc, depot } }).then((r) => r.data.data)

// { [containerTypeId]: totalAvailableAcrossAllNvoccs } — used by the booking
// forms' stock-check hint, which isn't NVOCC-specific at Step 1.
export const getStockMapByType = () =>
  getStockOverview().then((rows) => {
    const map = {}
    rows.forEach((row) => {
      const typeId = row.containerType._id
      map[typeId] = (map[typeId] || 0) + row.available
    })
    return map
  })

export const getContainers = ({ containerType, nvocc, depot, booking } = {}) =>
  api.get('/master/containers', { params: { containerType, nvocc, depot, booking } }).then((r) => r.data.data)

export const deleteContainer = (id) => api.delete(`/master/containers/${id}`).then((r) => r.data)

export const updateContainerUnit = (id, data) =>
  api.put(`/master/containers/${id}`, data).then((r) => r.data.data)

export const quickAddStock = ({ containerType, nvocc, depot, quantity }) =>
  api.post('/master/containers/quick-add', { containerType, nvocc, depot, quantity }).then((r) => r.data.data)

export const previewImportContainers = (file) => {
  const formData = new FormData()
  formData.append('file', file)
  return api
    .post('/master/containers/import-preview', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data.data)
}

export const commitImportContainers = (rows) =>
  api.post('/master/containers/import-commit', { rows }).then((r) => r.data.data)

export const downloadImportTemplate = async () => {
  const res = await api.get('/master/containers/import-template', { responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([res.data]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', 'stock-import-template.xlsx')
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
