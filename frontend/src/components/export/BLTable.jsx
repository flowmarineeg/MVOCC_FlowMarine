'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { FaEye } from 'react-icons/fa'
import Badge from '@/components/ui/Badge'
import Plate from '@/components/ui/Plate'

export default function BLTable({ jobs = [], canViewQuotations = false }) {
  return (
    <div className="overflow-x-auto border border-ink/25 bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-ink text-left font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            <th className="px-4 py-3">Job No</th>
            <th className="px-4 py-3">Quotation</th>
            <th className="px-4 py-3">Client</th>
            <th className="px-4 py-3">B/L Type</th>
            <th className="px-4 py-3">Client Confirmation</th>
            <th className="px-4 py-3">Job Status</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j, i) => (
            <motion.tr
              key={j._id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3) }}
              className="border-b border-line last:border-0 hover:bg-paper/70 transition-colors"
            >
              <td className="px-4 py-3"><Plate>{j.jobNo}</Plate></td>
              <td className="px-4 py-3 font-mono text-xs">
                {j.quotation ? (
                  canViewQuotations ? (
                    <Link href={`/export/quotations/${j.quotation._id}`} className="text-rust transition-colors hover:text-rust-dark" title="View source quotation">
                      {j.quotation.quotationNo}
                    </Link>
                  ) : (
                    <span className="text-muted">{j.quotation.quotationNo}</span>
                  )
                ) : (
                  <span className="text-muted">-</span>
                )}
              </td>
              <td className="px-4 py-3 text-ink">{j.clientName}</td>
              <td className="px-4 py-3 font-mono text-xs text-muted">{j.blType || '-'}</td>
              <td className="px-4 py-3"><Badge value={j.clientConfirmationStatus} /></td>
              <td className="px-4 py-3"><Badge value={j.jobStatus} /></td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end">
                  <Link
                    href={`/export/bookings/${j._id}`}
                    className="flex h-8 w-8 items-center justify-center text-muted transition-colors hover:bg-ink/5 hover:text-ink"
                    title="Open B&L"
                  >
                    <FaEye className="text-xs" />
                  </Link>
                </div>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
