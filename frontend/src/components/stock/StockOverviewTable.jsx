'use client'

import { motion } from 'framer-motion'
import { FaEye } from 'react-icons/fa'

export default function StockOverviewTable({ rows = [], onView }) {
  return (
    <div className="overflow-x-auto border border-ink/15 bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-ink text-left font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            <th className="px-4 py-3">Container Type</th>
            <th className="px-4 py-3">NVOCC</th>
            <th className="px-4 py-3">Available</th>
            <th className="px-4 py-3">Total</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <motion.tr
              key={`${row.containerType._id}-${row.nvocc._id}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3) }}
              className="border-b border-line last:border-0 hover:bg-paper/70 transition-colors"
            >
              <td className="px-4 py-3 text-ink">{row.containerType.code} — {row.containerType.label}</td>
              <td className="px-4 py-3 text-ink">{row.nvocc.name}</td>
              <td className="px-4 py-3 font-mono text-ink">{row.available}</td>
              <td className="px-4 py-3 font-mono text-muted">{row.total}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end">
                  <button
                    onClick={() => onView({ containerType: row.containerType, nvocc: row.nvocc })}
                    className="flex h-8 w-8 items-center justify-center text-muted transition-colors hover:bg-ink/5 hover:text-ink"
                    title="View containers"
                  >
                    <FaEye className="text-xs" />
                  </button>
                </div>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
