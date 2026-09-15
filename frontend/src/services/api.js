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
    // Validation failures (express-validator) come back as `{ errors: [...] }`
    // with no top-level `message` — every create/update form across the app
    // otherwise showed a generic "Something went wrong" for these instead of
    // the actual field error(s).
    const data = err.response?.data
    let message = data?.message
    if (!message && Array.isArray(data?.errors) && data.errors.length > 0) {
      message = [...new Set(data.errors.map((e) => e.msg || e.message).filter(Boolean))].join(' — ')
    }
    return Promise.reject(new Error(message || 'Something went wrong'))
  }
)

export default api
