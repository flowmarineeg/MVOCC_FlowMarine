'use client'

import { useEffect, useState } from 'react'
import * as auditLogApi from '@/services/auditLog'
import { useToast } from '@/components/ui/Toast'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import { PageLoader } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import Pagination from '@/components/ui/Pagination'

const resultOptions = [
  { value: '', label: 'All Results' },
  { value: 'SUCCESS', label: 'Success' },
  { value: 'FAILURE', label: 'Failure' },
]

const fmtDate = (d) => new Date(d).toLocaleString()

export default function AuditLogsPage() {
  const toast = useToast()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  const [action, setAction] = useState('')
  const [resource, setResource] = useState('')
  const [result, setResult] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)

  const filters = {
    action: action || undefined,
    resource: resource || undefined,
    result: result || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  }

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true)
      auditLogApi
        .getAuditLogs({ ...filters, page, limit })
        .then((res) => {
          setLogs(res.logs)
          setPages(res.pages)
          setTotal(res.total)
        })
        .catch((err) => toast(err.message, 'error'))
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, resource, result, dateFrom, dateTo, page, limit])

  const setFilter = (setter) => (v) => {
    setter(v)
    setPage(1)
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="border-b border-line pb-5">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-rust">Platform</p>
        <h1 className="mt-1 font-display text-3xl font-bold uppercase tracking-wide text-ink">Audit Log</h1>
        <p className="mt-1 text-sm text-muted">{total} recorded event{total === 1 ? '' : 's'}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 border border-ink/25 bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
        <input
          value={action}
          onChange={(e) => setFilter(setAction)(e.target.value)}
          placeholder="Action (e.g. LOGIN)"
          className="border border-ink/30 bg-paper px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust"
        />
        <input
          value={resource}
          onChange={(e) => setFilter(setResource)(e.target.value)}
          placeholder="Resource (e.g. Booking)"
          className="border border-ink/30 bg-paper px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust"
        />
        <Select options={resultOptions} value={result} onChange={setFilter(setResult)} placeholder="All Results" />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setFilter(setDateFrom)(e.target.value)}
          className="border border-ink/30 bg-paper px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setFilter(setDateTo)(e.target.value)}
          className="border border-ink/30 bg-paper px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust"
        />
      </div>

      {loading ? (
        <PageLoader />
      ) : logs.length === 0 ? (
        <EmptyState title="No events found" message="Try adjusting your filters." />
      ) : (
        <>
          <div className="overflow-x-auto border border-ink/25 bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-ink text-left font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Resource</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Description</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log._id} className="border-b border-line last:border-0 hover:bg-paper/70 transition-colors">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted">{fmtDate(log.createdAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink">{log.user?.name || log.userEmail || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted">{log.action}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{log.resource}</td>
                    <td className="whitespace-nowrap px-4 py-3"><Badge value={log.result} /></td>
                    <td className="px-4 py-3 text-muted">{log.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pages={pages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
        </>
      )}
    </div>
  )
}
