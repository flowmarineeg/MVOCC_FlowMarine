'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  FaShip,
  FaChartPie,
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
} from 'react-icons/fa'
import { useAuth } from '@/context/AuthContext'

export const NAV = [
  { type: 'link', label: 'Dashboard', href: '/', icon: FaChartPie, exact: true },
  {
    type: 'group',
    label: 'Export',
    icon: FaBoxes,
    items: [
      { label: 'Quotations', href: '/export/quotations', icon: FaFileInvoiceDollar, permission: 'quotation:read' },
      // Booking & Job now also hosts B&L (merged into the same details page's
      // Steps 4/5 — see docs/BOOKING_JOB_MERGE_DATA_REPORT.md), so this entry
      // stays visible for a bl:read-only role too, even without booking:read.
      { label: 'Booking & Job', href: '/export/bookings', icon: FaClipboardList, permissions: ['booking:read', 'bl:read'] },
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
      <div className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted/50">
        <Icon className="text-[13px]" />
        <span className="flex-1">{label}</span>
        <span className="rounded-md bg-ink/5 px-1.5 py-0.5 text-[10px] font-medium text-muted">Soon</span>
        <FaLock className="sr-only" />
      </div>
    )
  }
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        active ? 'bg-rust/10 font-medium text-rust' : 'text-muted hover:bg-ink/5 hover:text-ink'
      }`}
    >
      <Icon className="text-[13px]" />
      <span>{label}</span>
    </Link>
  )
}

export default function Sidebar({ open = false, onClose }) {
  const pathname = usePathname()
  const { permissions } = useAuth()

  // Most entries gate on a single `permission`; a few (Booking & Job, which
  // also hosts B&L) gate on `permissions` — visible if the user holds ANY
  // one of them.
  const canSee = (entry) =>
    entry.permissions ? entry.permissions.some((p) => permissions.includes(p)) : !entry.permission || permissions.includes(entry.permission)

  const visibleNav = NAV
    .map((entry) =>
      entry.type === 'group' ? { ...entry, items: entry.items.filter(canSee) } : entry
    )
    .filter((entry) => (entry.type === 'group' ? entry.items.length > 0 : canSee(entry)))

  // Match the single most specific href for the current path, so sibling
  // routes that share a prefix (e.g. /team and /team/roles) don't both
  // light up — only the longest matching href wins. The dashboard ('/') matches exactly.
  const allHrefs = NAV
    .flatMap((entry) => (entry.type === 'group' ? entry.items.map((i) => i.href) : [entry.href]))
    .filter((href) => href && href !== '#')
  const activeHref = allHrefs
    .filter((href) => (href === '/' ? pathname === '/' : pathname === href || pathname?.startsWith(`${href}/`)))
    .sort((a, b) => b.length - a.length)[0]

  const content = (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-line bg-card">
      <div className="flex h-16 items-center gap-3 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rust text-sm font-semibold text-white">N</div>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-ink">NVOCC</p>
          <p className="text-xs text-muted">Ops Console</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4 pt-2">
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
            <div key={entry.label} className="pt-4">
              <p className="px-3 pb-1.5 text-xs font-medium text-muted/80">{entry.label}</p>
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

      <div className="border-t border-line px-5 py-3 text-xs text-muted">Export module · v1.0</div>
    </div>
  )

  return (
    <>
      <div className="hidden lg:block">{content}</div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
          <div className="relative h-full shadow-xl">{content}</div>
        </div>
      )}
    </>
  )
}
