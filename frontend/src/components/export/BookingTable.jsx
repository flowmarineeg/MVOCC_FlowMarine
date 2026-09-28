'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { FaEye, FaTrash } from 'react-icons/fa'
import Badge from '@/components/ui/Badge'
import Plate from '@/components/ui/Plate'

export default function BookingTable({ bookings = [], canUpdate = false, canViewQuotations = false, onDeleteRequest }) {
  return (
    <div className="overflow-x-auto border border-ink/25 bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-ink text-left font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            <th className="px-4 py-3">Job No</th>
            <th className="px-4 py-3">Quotation</th>
            <th className="px-4 py-3">Client</th>
            <th className="px-4 py-3">POL</th>
            <th className="px-4 py-3">POD</th>
            <th className="px-4 py-3">Containers</th>
            <th className="px-4 py-3">B/L No</th>
            <th className="px-4 py-3">Job Status</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b, i) => (
            <motion.tr
              key={b._id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3) }}
              className="border-b border-line last:border-0 hover:bg-paper/70 transition-colors"
            >
              <td className="px-4 py-3"><Plate>{b.jobNo}</Plate></td>
              <td className="px-4 py-3 font-mono text-xs">
                {b.quotation ? (
                  canViewQuotations ? (
                    <Link href={`/export/quotations/${b.quotation._id}`} className="text-rust transition-colors hover:text-rust-dark" title="View source quotation">
                      {b.quotation.quotationNo}
                    </Link>
                  ) : (
                    <span className="text-muted">{b.quotation.quotationNo}</span>
                  )
                ) : (
                  <span className="text-muted">-</span>
                )}
              </td>
              <td className="px-4 py-3 text-ink">{b.clientName}</td>
              <td className="px-4 py-3 font-mono text-xs text-muted">{b.pol?.code || '-'}</td>
              <td className="px-4 py-3 font-mono text-xs text-muted">{b.pod?.code || '-'}</td>
              <td className="px-4 py-3 font-mono text-xs text-muted">
                {b.containers?.map((c) => `${c.containerType?.code || '?'} x${c.quantity}`).join(', ')}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-muted">{b.blNo || '-'}</td>
              <td className="px-4 py-3"><Badge value={b.jobStatus} /></td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <Link
                    href={`/export/bookings/${b._id}`}
                    className="flex h-8 w-8 items-center justify-center text-muted transition-colors hover:bg-ink/5 hover:text-ink"
                    title={canUpdate ? 'View / Edit' : 'View'}
                  >
                    <FaEye className="text-xs" />
                  </Link>
                  {canUpdate && b.status !== 'confirmed' && (
                    <button
                      onClick={() => onDeleteRequest(b)}
                      className="flex h-8 w-8 items-center justify-center text-muted transition-colors hover:bg-brick/10 hover:text-brick"
                      title="Delete"
                    >
                      <FaTrash className="text-xs" />
                    </button>
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
