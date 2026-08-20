'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import * as authApi from '@/services/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refetchMe = useCallback(() => {
    return authApi
      .getMe()
      .then(setUser)
      .catch(() => setUser(null))
  }, [])

  useEffect(() => {
    refetchMe().finally(() => setLoading(false))
  }, [refetchMe])

  const login = useCallback(async (data) => {
    const loggedInUser = await authApi.login(data)
    setUser(loggedInUser)
    return loggedInUser
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => {})
    setUser(null)
  }, [])

  const permissions = user?.role?.permissions || []

  return (
    <AuthContext.Provider value={{ user, permissions, loading, login, logout, refetchMe }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
