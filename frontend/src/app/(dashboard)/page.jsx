'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FaPlus, FaClipboardList, FaFileInvoiceDollar, FaBoxes, FaClock, FaArrowRight } from 'react-icons/fa'
import * as bookingApi from '@/services/exportBooking'
import * as quotationApi from '@/services/quotation'
import * as stockApi from '@/services/stock'
import { useAuth } from '@/context/AuthContext'
import Badge from '@/components/ui/Badge'
import Plate from '@/components/ui/Plate'
import { Card, StatCard, BarChart, DonutChart, BarList, SplitBars, SERIES } from '@/components/dashboard/widgets'

const DAY = 86400000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const JOB_STAGES = [
  ['open', 'Open'],
  ['in_progress', 'In progress'],
  ['completed', 'Completed'],
  ['closed_invoiced', 'Closed – invoiced'],
]
const QUOTE_STATUSES = [
  ['draft', 'Draft', SERIES[4]],
  ['sent', 'Sent', SERIES[0]],
  ['negotiation', 'Negotiation', SERIES[2]],
  ['approved', 'Approved', SERIES[1]],
  ['rejected', 'Rejected', 'var(--color-brick)'],
  ['expired', 'Expired', '#cbd5e1'],
]

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—')

export default function DashboardPage() {
  const { user, permissions } = useAuth()
  const canJobs = permissions.includes('booking:read')
  const canQuotes = permissions.includes('quotation:read')
  const canStock = permissions.includes('masterData:read')

  const [bookings, setBookings] = useState([])
  const [quotations, setQuotations] = useState([])
  const [stock, setStock] = useState([])
  const [loading, setLoading] = useState(() => canJobs || canQuotes || canStock)
  const [now] = useState(() => Date.now()) // fixed for the life of the page so the memo below stays pure

  useEffect(() => {
    if (!canJobs && !canQuotes && !canStock) return
    Promise.all([
      canJobs ? bookingApi.getBookings({ limit: 500 }).then((r) => r.bookings || []).catch(() => []) : [],
      canQuotes ? quotationApi.getQuotations({ limit: 500 }).then((r) => r.quotations || []).catch(() => []) : [],
      canStock ? stockApi.getStockOverview().catch(() => []) : [],
    ])
      .then(([b, q, s]) => {
        setBookings(b)
        setQuotations(q)
        setStock(s)
      })
      .finally(() => setLoading(false))
  }, [canJobs, canQuotes, canStock])

  const m = useMemo(() => {
    const live = bookings.filter((b) => b.status !== 'cancelled')
    const activeJobs = live.filter((b) => !['completed', 'closed_invoiced'].includes(b.jobStatus))

    // jobs created per month, last 6 months
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date()
      d.setDate(1)
      d.setMonth(d.getMonth() - (5 - i))
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS[d.getMonth()], value: 0 }
    })
    for (const b of bookings) {
      const d = new Date(b.createdAt)
      const slot = months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`)
      if (slot) slot.value += 1
    }
    const thisMonth = months[5].value
    const lastMonth = months[4].value

    const stages = JOB_STAGES.map(([key, label]) => ({ label, value: live.filter((b) => (b.jobStatus || 'open') === key).length }))
    const departures = live
      .filter((b) => b.etd && new Date(b.etd).getTime() >= now - DAY && new Date(b.etd).getTime() <= now + 21 * DAY)
      .sort((a, b) => new Date(a.etd) - new Date(b.etd))
      .slice(0, 5)

    const open = quotations.filter((q) => ['sent', 'negotiation'].includes(q.status))
    const expiringSoon = open.filter((q) => q.validityDate && new Date(q.validityDate).getTime() - now < 7 * DAY && new Date(q.validityDate).getTime() >= now - DAY).length
    const pipeline = QUOTE_STATUSES.map(([key, label, color]) => ({ label, color, value: quotations.filter((q) => q.status === key).length })).filter((x) => x.value > 0)
    const recentQuotes = [...quotations].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5)

    const byType = {}
    for (const row of stock) {
      const code = row.containerType?.code || '?'
      byType[code] = byType[code] || { label: code, a: 0, b: 0 }
      byType[code].a += row.available
      byType[code].b += row.total - row.available
    }
    const types = Object.values(byType).sort((x, y) => y.a + y.b - (x.a + x.b)).slice(0, 6)
    const free = types.reduce((t, x) => t + x.a, 0)
    const held = types.reduce((t, x) => t + x.b, 0)

    return { live, activeJobs, months, thisMonth, lastMonth, stages, departures, open, expiringSoon, pipeline, recentQuotes, types, free, held }
  }, [bookings, quotations, stock, now])

  const delta = m.thisMonth - m.lastMonth
  const pending = m.live.filter((b) => b.status === 'pending').length

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-muted">{today}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-ink">
            {greeting()}, {user?.name?.split(' ')[0] || 'there'}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {permissions.includes('quotation:create') && (
            <Link href="/export/quotations/new" className="inline-flex items-center gap-2 rounded-lg bg-rust px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rust-dark">
              <FaPlus className="text-xs" /> New quotation
            </Link>
          )}
          {permissions.includes('booking:create') && (
            <Link href="/export/bookings/new" className="inline-flex items-center gap-2 rounded-lg border border-line bg-card px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-ink/5">
              <FaPlus className="text-xs" /> New booking
            </Link>
          )}
        </div>
      </div>

      {!canJobs && !canQuotes && !canStock && (
        <Card title="Welcome">
          <p className="text-sm text-muted">Your role has no dashboard data yet. Use the menu on the left to open the areas you can work in.</p>
        </Card>
      )}

      {(canJobs || canQuotes || canStock) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {canJobs && <StatCard loading={loading} label="Active jobs" value={m.activeJobs.length} icon={FaClipboardList} hint={`${pending} waiting for confirmation`} />}
          {canJobs && (
            <StatCard
              loading={loading}
              label="Jobs this month"
              value={m.thisMonth}
              icon={FaClock}
              tone="neutral"
              hint={delta === 0 ? 'Same as last month' : `${delta > 0 ? '+' : ''}${delta} vs last month`}
            />
          )}
          {canQuotes && (
            <StatCard loading={loading} label="Open quotations" value={m.open.length} icon={FaFileInvoiceDollar} tone="warning" hint={m.expiringSoon ? `${m.expiringSoon} expire within 7 days` : 'None expiring this week'} />
          )}
          {canStock && <StatCard loading={loading} label="Free containers" value={m.free} icon={FaBoxes} tone="success" hint={`${m.held} allocated to jobs`} />}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {canJobs && (
          <Card title="Jobs created" description="New jobs per month, last 6 months" className="lg:col-span-2">
            <BarChart data={m.months} />
          </Card>
        )}
        {canQuotes && (
          <Card title="Quotation pipeline" description="All quotations by status">
            {m.pipeline.length ? <DonutChart data={m.pipeline} centerLabel="quotations" /> : <p className="py-10 text-center text-sm text-muted">No quotations yet</p>}
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {canJobs && (
          <Card title="Jobs by stage" description="Live jobs, cancelled excluded">
            <BarList data={m.stages} />
          </Card>
        )}
        {canStock && (
          <Card title="Container stock" description="Free vs allocated, by type">
            <SplitBars data={m.types} aLabel="Free" bLabel="Allocated" />
          </Card>
        )}
        {canJobs && (
          <Card
            title="Upcoming departures"
            description="ETD in the next 3 weeks"
            action={<Link href="/export/bookings" className="inline-flex items-center gap-1 text-xs font-medium text-rust hover:text-rust-dark">All jobs <FaArrowRight className="text-[9px]" /></Link>}
          >
            {m.departures.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">No departures scheduled</p>
            ) : (
              <ul className="divide-y divide-line">
                {m.departures.map((b) => (
                  <li key={b._id}>
                    <Link href={`/export/bookings/${b._id}`} className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:text-rust">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">{b.clientName}</span>
                        <span className="block truncate text-xs text-muted">{b.pol?.code || '—'} → {b.pod?.code || '—'}</span>
                      </span>
                      <span className="shrink-0 text-right text-xs text-muted">{fmtDate(b.etd)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      {canQuotes && (
        <Card
          title="Recent quotations"
          action={<Link href="/export/quotations" className="inline-flex items-center gap-1 text-xs font-medium text-rust hover:text-rust-dark">View all <FaArrowRight className="text-[9px]" /></Link>}
        >
          {m.recentQuotes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Create your first quotation to see it here.</p>
          ) : (
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-muted">
                    <th className="px-5 py-2">Quotation</th>
                    <th className="px-3 py-2">Client</th>
                    <th className="px-3 py-2">Valid until</th>
                    <th className="px-3 py-2 text-right">Selling total</th>
                    <th className="px-5 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {m.recentQuotes.map((q) => (
                    <tr key={q._id} className="border-t border-line">
                      <td className="px-5 py-2.5"><Link href={`/export/quotations/${q._id}`}><Plate>{q.quotationNo}</Plate></Link></td>
                      <td className="px-3 py-2.5 text-ink">{q.clientName}</td>
                      <td className="px-3 py-2.5 text-muted">{fmtDate(q.validityDate)}</td>
                      <td className="px-3 py-2.5 text-right text-ink">{q.totalSellingPrice ? `${q.totalSellingPrice.toLocaleString()} ${q.totalsCurrency || ''}` : '—'}</td>
                      <td className="px-5 py-2.5"><Badge value={q.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
