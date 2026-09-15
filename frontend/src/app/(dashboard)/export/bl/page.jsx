'use client'

import { useEffect, useState } from 'react'
import { FaSearch } from 'react-icons/fa'
import * as blApi from '@/services/bl'
import { PageLoader } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import Pagination from '@/components/ui/Pagination'
import BLTable from '@/components/export/BLTable'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'

export default function BLListPage() {
  const toast = useToast()
  const { permissions } = useAuth()
  const canViewQuotations = permissions.includes('quotation:read')

  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)

  const fetchJobs = () => {
    setLoading(true)
    blApi
      .getBlJobs({ search: search || undefined, page, limit })
      .then((res) => {
        setJobs(res.bookings)
        setPages(res.pages)
        setTotal(res.total)
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const t = setTimeout(fetchJobs, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page, limit])

  const setFilter = (setter) => (v) => {
    setter(v)
    setPage(1)
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="border-b border-line pb-5">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-rust">Export · Step 3</p>
        <h1 className="mt-1 font-display text-3xl font-bold uppercase tracking-wide text-ink">B&amp;L</h1>
        <p className="mt-1 font-mono text-xs text-muted">{total} job{total === 1 ? '' : 's'} on file</p>
      </div>

      <div className="border border-ink/25 bg-card p-4 sm:max-w-md">
        <div className="relative">
          <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted" />
          <input
            value={search}
            onChange={(e) => setFilter(setSearch)(e.target.value)}
            placeholder="Search job no / client"
            className="w-full border border-ink/30 bg-paper py-2.5 pl-10 pr-3.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust"
          />
        </div>
      </div>

      {loading ? (
        <PageLoader />
      ) : jobs.length === 0 ? (
        <EmptyState title="No jobs on file" message="Convert a quotation to a job, or adjust your search." />
      ) : (
        <>
          <BLTable jobs={jobs} canViewQuotations={canViewQuotations} />
          <Pagination page={page} pages={pages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
        </>
      )}
    </div>
  )
}
