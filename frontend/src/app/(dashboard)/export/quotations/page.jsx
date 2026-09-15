'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FaPlus, FaSearch } from 'react-icons/fa'
import * as quotationApi from '@/services/quotation'
import Select from '@/components/ui/Select'
import { PageLoader } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import Pagination from '@/components/ui/Pagination'
import QuotationTable from '@/components/export/QuotationTable'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

export default function QuotationsListPage() {
  const toast = useToast()
  const { permissions } = useAuth()
  const canCreate = permissions.includes('quotation:create')
  const canUpdate = permissions.includes('quotation:update')
  const canOverrideLock = permissions.includes('quotation:approve')

  const [quotations, setQuotations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)

  const fetchQuotations = () => {
    setLoading(true)
    quotationApi
      .getQuotations({ search: search || undefined, status: status || undefined, page, limit })
      .then((res) => {
        setQuotations(res.quotations)
        setPages(res.pages)
        setTotal(res.total)
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const t = setTimeout(fetchQuotations, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, page, limit])

  const setFilter = (setter) => (v) => {
    setter(v)
    setPage(1)
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-4 border-b border-line pb-5 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-rust">Export · Pre-Booking</p>
          <h1 className="mt-1 font-display text-3xl font-bold uppercase tracking-wide text-ink">Quotations</h1>
          <p className="mt-1 font-mono text-xs text-muted">{total} record{total === 1 ? '' : 's'} on file</p>
        </div>
        {canCreate && (
          <Link
            href="/export/quotations/new"
            className="flex items-center gap-2 bg-rust px-4 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-rust-dark"
          >
            <FaPlus /> New quotation
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 border border-ink/25 bg-card p-4 sm:grid-cols-2">
        <div className="relative">
          <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted" />
          <input
            value={search}
            onChange={(e) => setFilter(setSearch)(e.target.value)}
            placeholder="Search quotation no / client"
            className="w-full border border-ink/30 bg-paper py-2.5 pl-10 pr-3.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust"
          />
        </div>
        <Select options={statusOptions} value={status} onChange={setFilter(setStatus)} placeholder="All Statuses" />
      </div>

      {loading ? (
        <PageLoader />
      ) : quotations.length === 0 ? (
        <EmptyState
          title="No quotations on file"
          message={canCreate ? 'Try adjusting your filters, or open a new quotation to start pricing a request.' : 'Try adjusting your filters.'}
          action={
            canCreate && (
              <Link href="/export/quotations/new" className="inline-flex items-center gap-2 bg-rust px-4 py-2 text-sm font-semibold text-card transition-colors hover:bg-rust-dark">
                <FaPlus /> New quotation
              </Link>
            )
          }
        />
      ) : (
        <>
          <QuotationTable quotations={quotations} canUpdate={canUpdate} canOverrideLock={canOverrideLock} />
          <Pagination page={page} pages={pages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
        </>
      )}
    </div>
  )
}
