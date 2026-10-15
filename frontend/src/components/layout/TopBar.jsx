'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { FaBars, FaSignOutAlt } from 'react-icons/fa'
import { useAuth } from '@/context/AuthContext'
import Modal from '@/components/ui/Modal'

// Page title shown in the bar, taken from the route.
const TITLES = [
  ['/export/quotations', 'Quotations'],
  ['/export/bookings', 'Booking & Job'],
  ['/export/preview', 'Preview'],
  ['/stock', 'Stock'],
  ['/master-data', 'Master data'],
  ['/team/roles', 'Roles'],
  ['/team', 'Members'],
  ['/audit-logs', 'Audit log'],
]
const titleFor = (path) => (path === '/' ? 'Dashboard' : TITLES.find(([p]) => path?.startsWith(p))?.[1] || 'Export')

const initials = (name = '') =>
  name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'

export default function TopBar({ onMenuClick }) {
  const { user, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
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
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center text-muted transition-colors hover:bg-ink/5 hover:text-ink lg:hidden"
        >
          <FaBars />
        </button>
        <h1 className="text-sm font-medium text-ink">{titleFor(pathname)}</h1>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rust/10 text-xs font-semibold text-rust">
            {initials(user?.name || user?.email)}
          </span>
          <span className="hidden leading-tight sm:block">
            <span className="block text-sm font-medium text-ink">{user?.name || user?.email}</span>
            <span className="block text-xs text-muted">{user?.role?.name}</span>
          </span>
        </div>
        <button
          onClick={() => setLogoutOpen(true)}
          title="Sign out"
          aria-label="Sign out"
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
