'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FaBars, FaUserCircle, FaSignOutAlt } from 'react-icons/fa'
import { useAuth } from '@/context/AuthContext'
import Modal from '@/components/ui/Modal'

export default function TopBar({ onMenuClick }) {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
      router.push('/login')
    } finally {
      setLoggingOut(false)
      setLogoutOpen(false)
    }
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-line bg-card px-4 sm:px-6">
      <button
        onClick={onMenuClick}
        className="flex h-9 w-9 items-center justify-center text-muted transition-colors hover:bg-ink/5 hover:text-ink lg:hidden"
      >
        <FaBars />
      </button>
      <h1 className="hidden font-mono text-xs uppercase tracking-[0.18em] text-muted lg:block">
        Export Module
      </h1>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-ink">
          <FaUserCircle className="text-xl text-ink/30" />
          <span className="hidden sm:inline">
            <span className="font-medium">{user?.name || user?.email}</span>
            <span className="ml-1.5 font-mono text-[10px] uppercase tracking-wide text-muted">{user?.role?.name}</span>
          </span>
        </div>
        <button
          onClick={() => setLogoutOpen(true)}
          title="Sign out"
          className="flex h-9 w-9 items-center justify-center text-muted transition-colors hover:bg-brick/10 hover:text-brick"
        >
          <FaSignOutAlt />
        </button>
      </div>

      <Modal
        isOpen={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        onConfirm={handleLogout}
        title="Sign out?"
        message="You'll need to log in again to access the dashboard."
        confirmLabel="Sign out"
        danger
        loading={loggingOut}
      />
    </header>
  )
}
