'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FaPlus, FaTable, FaFileExcel, FaSearch } from 'react-icons/fa'
import * as bookingApi from '@/services/exportBooking'
import * as masterDataApi from '@/services/masterData'
import Select from '@/components/ui/Select'
import { PageLoader } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import Pagination from '@/components/ui/Pagination'
import BookingTable from '@/components/export/BookingTable'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function BookingsListPage() {
  const toast = useToast()
  const { permissions } = useAuth()
  const canCreate = permissions.includes('booking:create')
  const canUpdate = permissions.includes('booking:update')
  const canExport = permissions.includes('booking:export')
  const [bookings, setBookings] = useState([])
  const [ports, setPorts] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [confirmingId, setConfirmingId] = useState(null)
  const [cancellingId, setCancellingId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [pol, setPol] = useState('')
  const [pod, setPod] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    masterDataApi.getPorts().then(setPorts).catch(() => {})
  }, [])

  const filters = { search: search || undefined, status: status || undefined, pol: pol || undefined, pod: pod || undefined }

  const fetchBookings = () => {
    setLoading(true)
    bookingApi
      .getBookings({ ...filters, page, limit })
      .then((res) => {
        setBookings(res.bookings)
        setPages(res.pages)
        setTotal(res.total)
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const t = setTimeout(fetchBookings, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, pol, pod, page, limit])

  const setFilter = (setter) => (v) => {
    setter(v)
    setPage(1)
  }
  const handleSearchChange = (e) => setFilter(setSearch)(e.target.value)
  const handleStatusChange = setFilter(setStatus)
  const handlePolChange = setFilter(setPol)
  const handlePodChange = setFilter(setPod)

  const handleConfirm = async (id) => {
    setConfirmingId(id)
    try {
      await bookingApi.confirmBooking(id)
      toast('Booking confirmed', 'success')
      fetchBookings()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setConfirmingId(null)
    }
  }

  const handleCancel = async (id) => {
    setCancellingId(id)
    try {
      await bookingApi.cancelBooking(id)
      toast('Booking cancelled', 'success')
      fetchBookings()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setCancellingId(null)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await bookingApi.deleteBooking(deleteTarget._id)
      toast('Booking deleted', 'success')
      setDeleteTarget(null)
      fetchBookings()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setDeleting(false)
    }
  }

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
      <div className="flex flex-col justify-between gap-4 border-b border-line pb-5 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-rust">Export · Ledger 01</p>
          <h1 className="mt-1 font-display text-3xl font-bold uppercase tracking-wide text-ink">Booking Manifest</h1>
          <p className="mt-1 font-mono text-xs text-muted">{total} record{total === 1 ? '' : 's'} on file</p>
        </div>
        <div className="flex items-center gap-2">
          {canExport && (
            <>
              <Link
                href="/export/preview"
                className="flex items-center gap-2 border border-ink/30 bg-card px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-ink/5"
              >
                <FaTable /> Preview
              </Link>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-2 border border-stamp/40 bg-stamp/10 px-4 py-2.5 text-sm font-medium text-stamp transition-colors hover:bg-stamp/20 disabled:opacity-50"
              >
                <FaFileExcel /> {exporting ? 'Exporting…' : 'Export Excel'}
              </button>
            </>
          )}
          {canCreate && (
            <Link
              href="/export/bookings/new"
              className="flex items-center gap-2 bg-rust px-4 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-rust-dark"
            >
              <FaPlus /> New booking
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 border border-ink/25 bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted" />
          <input
            value={search}
            onChange={handleSearchChange}
            placeholder="Search job no / client / B-L"
            className="w-full border border-ink/30 bg-paper py-2.5 pl-10 pr-3.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust"
          />
        </div>
        <Select options={statusOptions} value={status} onChange={handleStatusChange} placeholder="All Statuses" />
        <Select options={portOptions} value={pol} onChange={handlePolChange} placeholder="All Ports (POL)" searchable />
        <Select options={portOptions} value={pod} onChange={handlePodChange} placeholder="All Ports (POD)" searchable />
      </div>

      {loading ? (
        <PageLoader />
      ) : bookings.length === 0 ? (
        <EmptyState
          title="No bookings on file"
          message={canCreate ? 'Try adjusting your filters, or open a new booking to start a shipment.' : 'Try adjusting your filters.'}
          action={
            canCreate && (
              <Link href="/export/bookings/new" className="inline-flex items-center gap-2 bg-rust px-4 py-2 text-sm font-semibold text-card transition-colors hover:bg-rust-dark">
                <FaPlus /> New booking
              </Link>
            )
          }
        />
      ) : (
        <>
          <BookingTable
            bookings={bookings}
            canUpdate={canUpdate}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
            onDeleteRequest={setDeleteTarget}
            confirmingId={confirmingId}
            cancellingId={cancellingId}
          />
          <Pagination page={page} pages={pages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
        </>
      )}

      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete this booking?"
        message={`This will permanently delete booking ${deleteTarget?.jobNo || ''}. This cannot be undone.`}
        confirmLabel="Delete booking"
        danger
        loading={deleting}
      />
    </div>
  )
}
