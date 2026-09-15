'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { FaEye, FaEdit, FaExclamationTriangle } from 'react-icons/fa'
import Badge from '@/components/ui/Badge'
import Plate from '@/components/ui/Plate'

const LOCKED_STATUSES = ['sent', 'approved', 'rejected']

export default function QuotationTable({ quotations = [], canUpdate = false, canOverrideLock = false }) {
  return (
    <div className="overflow-x-auto border border-ink/25 bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-ink text-left font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            <th className="px-4 py-3">Quotation No</th>
            <th className="px-4 py-3">Client</th>
            <th className="px-4 py-3">POL</th>
            <th className="px-4 py-3">POD</th>
            <th className="px-4 py-3">NVOCC</th>
            <th className="px-4 py-3">Margin</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {quotations.map((q, i) => (
            <motion.tr
              key={q._id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3) }}
              className="border-b border-line last:border-0 hover:bg-paper/70 transition-colors"
            >
              <td className="px-4 py-3"><Plate>{q.quotationNo}</Plate></td>
              <td className="px-4 py-3 text-ink">{q.clientName}</td>
              <td className="px-4 py-3 font-mono text-xs text-muted">{q.pol?.code || '-'}</td>
              <td className="px-4 py-3 font-mono text-xs text-muted">{q.pod?.code || '-'}</td>
              <td className="px-4 py-3 font-mono text-xs text-muted">{q.nvocc?.code || '-'}</td>
              <td className="px-4 py-3 font-mono text-xs">
                <span className={q.belowMinMargin ? 'inline-flex items-center gap-1 text-brick' : 'text-muted'}>
                  {q.belowMinMargin && <FaExclamationTriangle className="text-[10px]" />}
                  {(q.profitMarginPercent ?? 0).toFixed(1)}%
                </span>
              </td>
              <td className="px-4 py-3"><Badge value={q.linkedBooking ? 'job_created' : q.status} /></td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <Link
                    href={`/export/quotations/${q._id}`}
                    className="flex h-8 w-8 items-center justify-center text-muted transition-colors hover:bg-ink/5 hover:text-ink"
                    title="View"
                  >
                    <FaEye className="text-xs" />
                  </Link>
                  {canUpdate && (!LOCKED_STATUSES.includes(q.status) || canOverrideLock) && (
                    <Link
                      href={`/export/quotations/${q._id}`}
                      className="flex h-8 w-8 items-center justify-center text-muted transition-colors hover:bg-ink/5 hover:text-ink"
                      title="Edit"
                    >
                      <FaEdit className="text-xs" />
                    </Link>
                  )}
                </div>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
