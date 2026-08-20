import axios from 'axios'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
  withCredentials: true,
})

const PUBLIC_PATH_PREFIXES = ['/login', '/forgot-password', '/reset-password', '/invite']

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (
      typeof window !== 'undefined' &&
      err.response?.status === 401 &&
      !PUBLIC_PATH_PREFIXES.some((p) => window.location.pathname.startsWith(p))
    ) {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- plain module outside React, no router access here
      window.location.href = '/login'
    }
    const message = err.response?.data?.message || 'Something went wrong'
    return Promise.reject(new Error(message))
  }
)

export default api
