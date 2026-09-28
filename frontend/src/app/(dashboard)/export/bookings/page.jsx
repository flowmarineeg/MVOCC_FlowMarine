'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FaPlus, FaSearch } from 'react-icons/fa'
import * as bookingApi from '@/services/exportBooking'
import * as blApi from '@/services/bl'
import * as masterDataApi from '@/services/masterData'
import Select from '@/components/ui/Select'
import { PageLoader } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import Pagination from '@/components/ui/Pagination'
import BookingTable from '@/components/export/BookingTable'
import BLTable from '@/components/export/BLTable'
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
  const canReadBooking = permissions.includes('booking:read')
  const canReadBl = permissions.includes('bl:read')
  const canCreate = permissions.includes('booking:create')
  const canUpdate = permissions.includes('booking:update')
  const canViewQuotations = permissions.includes('quotation:read')
  const [bookings, setBookings] = useState([])
  const [blJobs, setBlJobs] = useState([])
  const [ports, setPorts] = useState([])
  // Lazy-initialized from the (stable, permission-derived) "has neither
  // permission" case rather than set inside the effect below — see the
  // matching note on the merged details page.
  const [loading, setLoading] = useState(() => canReadBooking || canReadBl)
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
    if (canReadBooking) masterDataApi.getPorts().then(setPorts).catch(() => {})
  }, [canReadBooking])

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

  // A viewer with only bl:read (no booking:read) — e.g. a documentation-only
  // role — sees the same list page, but the field-limited B&L job list
  // instead of the full Booking list; opening a row still lands on the
  // merged /export/bookings/[id] details page either way.
  const fetchBlJobs = () => {
    setLoading(true)
    blApi
      .getBlJobs({ search: search || undefined, page, limit })
      .then((res) => {
        setBlJobs(res.bookings)
        setPages(res.pages)
        setTotal(res.total)
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!canReadBooking && !canReadBl) return // loading already starts false in this case
    const t = setTimeout(canReadBooking ? fetchBookings : fetchBlJobs, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, pol, pod, page, limit, canReadBooking, canReadBl])

  const setFilter = (setter) => (v) => {
    setter(v)
    setPage(1)
  }
  const handleSearchChange = (e) => setFilter(setSearch)(e.target.value)
  const handleStatusChange = setFilter(setStatus)
  const handlePolChange = setFilter(setPol)
  const handlePodChange = setFilter(setPod)

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
            placeholder={canReadBooking ? 'Search job no / client / B-L' : 'Search job no / client'}
            className="w-full border border-ink/30 bg-paper py-2.5 pl-10 pr-3.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust"
          />
        </div>
        {canReadBooking && (
          <>
            <Select options={statusOptions} value={status} onChange={handleStatusChange} placeholder="All Statuses" />
            <Select options={portOptions} value={pol} onChange={handlePolChange} placeholder="All Ports (POL)" searchable />
            <Select options={portOptions} value={pod} onChange={handlePodChange} placeholder="All Ports (POD)" searchable />
          </>
        )}
      </div>

      {!canReadBooking && !canReadBl ? (
        <EmptyState title="Not authorized" message="You don't have permission to view bookings." />
      ) : loading ? (
        <PageLoader />
      ) : canReadBooking ? (
        bookings.length === 0 ? (
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
              canViewQuotations={canViewQuotations}
              onDeleteRequest={setDeleteTarget}
            />
            <Pagination page={page} pages={pages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
          </>
        )
      ) : blJobs.length === 0 ? (
        <EmptyState title="No jobs on file" message="Convert a quotation to a job, or adjust your search." />
      ) : (
        <>
          <BLTable jobs={blJobs} canViewQuotations={canViewQuotations} />
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
