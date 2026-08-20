'use client'

import { useEffect, useState } from 'react'
import { FaSearch } from 'react-icons/fa'
import * as bookingApi from '@/services/exportBooking'
import * as masterDataApi from '@/services/masterData'
import Select from '@/components/ui/Select'
import { PageLoader } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'
import PreviewSummaryHeader from '@/components/export/PreviewSummaryHeader'
import BookingPreviewTable from '@/components/export/BookingPreviewTable'

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function PreviewPage() {
  const toast = useToast()
  const { permissions } = useAuth()
  const canExport = permissions.includes('booking:export')
  const [ports, setPorts] = useState([])
  const [summary, setSummary] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(canExport)
  const [exporting, setExporting] = useState(false)

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [pol, setPol] = useState('')
  const [pod, setPod] = useState('')

  useEffect(() => {
    masterDataApi.getPorts().then(setPorts).catch(() => {})
  }, [])

  const filters = { search: search || undefined, status: status || undefined, pol: pol || undefined, pod: pod || undefined }

  useEffect(() => {
    if (!canExport) return undefined
    const t = setTimeout(() => {
      setLoading(true)
      bookingApi
        .getPreview(filters)
        .then((res) => {
          setSummary(res.summary)
          setRows(res.bookings)
        })
        .catch((err) => toast(err.message, 'error'))
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, pol, pod, canExport])

  const handleExport = async () => {
    setExporting(true)
    try {
      await bookingApi.exportExcel(filters)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setExporting(false)
    }
  }

  const portOptions = [{ value: '', label: 'All Ports' }, ...ports.map((p) => ({ value: p._id, label: `${p.code} — ${p.name}` }))]

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="border-b border-line pb-5">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-rust">Export · Ledger 02</p>
        <h1 className="mt-1 font-display text-3xl font-bold uppercase tracking-wide text-ink">Manifest Preview</h1>
        <p className="mt-1 text-sm text-muted">Aggregated totals and the full booking table, ready to export</p>
      </div>

      <div className="grid grid-cols-1 gap-3 border border-ink/15 bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search job no / client"
            className="w-full border border-ink/20 bg-paper py-2.5 pl-10 pr-3.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust"
          />
        </div>
        <Select options={statusOptions} value={status} onChange={setStatus} placeholder="All Statuses" />
        <Select options={portOptions} value={pol} onChange={setPol} placeholder="All Ports (POL)" searchable />
        <Select options={portOptions} value={pod} onChange={setPod} placeholder="All Ports (POD)" searchable />
      </div>

      {!canExport ? (
        <EmptyState title="Not authorized" message="You don't have permission to view or export the booking preview." />
      ) : loading ? (
        <PageLoader />
      ) : rows.length === 0 ? (
        <EmptyState title="No bookings to preview" message="Try adjusting your filters." />
      ) : (
        <>
          <PreviewSummaryHeader summary={summary} />
          <BookingPreviewTable bookings={rows} onExport={handleExport} exporting={exporting} />
        </>
      )}
    </div>
  )
}
