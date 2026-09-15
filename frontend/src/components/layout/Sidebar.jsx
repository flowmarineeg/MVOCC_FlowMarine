'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  FaShip,
  FaCompass,
  FaClipboardList,
  FaTable,
  FaBoxes,
  FaDatabase,
  FaWarehouse,
  FaLock,
  FaUsers,
  FaUserShield,
  FaHistory,
  FaFileInvoiceDollar,
  FaFileContract,
} from 'react-icons/fa'
import { useAuth } from '@/context/AuthContext'

const NAV = [
  { type: 'link', label: 'Dashboard', href: '/', icon: FaCompass },
  {
    type: 'group',
    label: 'Export',
    icon: FaBoxes,
    items: [
      { label: 'Quotations', href: '/export/quotations', icon: FaFileInvoiceDollar, permission: 'quotation:read' },
      { label: 'Booking & Job', href: '/export/bookings', icon: FaClipboardList, permission: 'booking:read' },
      { label: 'B&L', href: '/export/bl', icon: FaFileContract, permission: 'bl:read' },
      { label: 'Preview', href: '/export/preview', icon: FaTable, permission: 'booking:export' },
    ],
  },
  { type: 'link', label: 'Import', href: '#', icon: FaShip, disabled: true },
  { type: 'link', label: 'Stock', href: '/stock', icon: FaWarehouse, permission: 'masterData:read' },
  { type: 'link', label: 'Master Data', href: '/master-data', icon: FaDatabase, permission: 'masterData:read' },
  {
    type: 'group',
    label: 'Team',
    icon: FaUsers,
    items: [
      { label: 'Members', href: '/team', icon: FaUsers, permission: 'team:read' },
      { label: 'Roles', href: '/team/roles', icon: FaUserShield, permission: 'role:read' },
    ],
  },
  { type: 'link', label: 'Audit Log', href: '/audit-logs', icon: FaHistory, permission: 'auditLog:read' },
]

function NavLink({ href, label, icon: Icon, disabled, active }) {
  if (disabled) {
    return (
      <div className="flex cursor-not-allowed items-center gap-3 px-3.5 py-2.5 text-sm text-paper/25">
        <Icon className="text-sm" />
        <span className="flex-1">{label}</span>
        <FaLock className="text-[10px]" />
      </div>
    )
  }
  return (
    <Link
      href={href}
      className={`relative flex items-center gap-3 px-3.5 py-2.5 text-sm transition-colors ${
        active ? 'bg-white/[0.06] font-semibold text-paper' : 'text-paper/60 hover:bg-white/[0.04] hover:text-paper'
      }`}
    >
      {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 bg-rust" />}
      <Icon className="text-sm" />
      <span>{label}</span>
    </Link>
  )
}

export default function Sidebar({ open = false, onClose }) {
  const pathname = usePathname()
  const { permissions } = useAuth()

  const canSee = (entry) => !entry.permission || permissions.includes(entry.permission)

  const visibleNav = NAV
    .map((entry) =>
      entry.type === 'group' ? { ...entry, items: entry.items.filter(canSee) } : entry
    )
    .filter((entry) => (entry.type === 'group' ? entry.items.length > 0 : canSee(entry)))

  // Match the single most specific href for the current path, so sibling
  // routes that share a prefix (e.g. /team and /team/roles) don't both
  // light up — only the longest matching href wins.
  const allHrefs = NAV
    .flatMap((entry) => (entry.type === 'group' ? entry.items.map((i) => i.href) : [entry.href]))
    .filter((href) => href && href !== '#')
  const activeHref = allHrefs
    .filter((href) => pathname === href || pathname?.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0]

  const content = (
    <div className="grain flex h-full w-64 shrink-0 flex-col bg-ink">
      <div className="flex h-16 items-center gap-2.5 border-b border-ink-line px-5">
        <div className="flex h-8 w-8 items-center justify-center border-2 border-rust font-display text-sm font-bold text-rust">
          N
        </div>
        <div className="leading-tight">
          <p className="font-display text-base font-bold uppercase tracking-wide text-paper">NVOCC</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/35">Ops Console</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {visibleNav.map((entry) =>
          entry.type === 'link' ? (
            <NavLink
              key={entry.label}
              href={entry.href}
              label={entry.label}
              icon={entry.icon}
              disabled={entry.disabled}
              active={entry.href === activeHref}
            />
          ) : (
            <div key={entry.label} className="pt-3">
              <div className="flex items-center gap-2 px-3.5 pb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-paper/30">
                <entry.icon className="text-[10px]" />
                {entry.label}
              </div>
              <div className="space-y-1">
                {entry.items.map((item) => (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    active={item.href === activeHref}
                  />
                ))}
              </div>
            </div>
          )
        )}
      </nav>

      <div className="border-t border-ink-line px-5 py-4 font-mono text-[10px] uppercase tracking-[0.14em] text-paper/30">
        Export MVP · Rev. 1.0
      </div>
    </div>
  )

  return (
    <>
      <div className="hidden lg:block">{content}</div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/60" onClick={onClose} />
          <div className="relative h-full">{content}</div>
        </div>
      )}
    </>
  )
}
