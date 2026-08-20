'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { FaSave } from 'react-icons/fa'
import Badge from '@/components/ui/Badge'

function StockRow({ row, index, canUpdate, saving, onSave }) {
  const [value, setValue] = useState(row.availableCount)
  const dirty = Number(value) !== row.availableCount

  return (
    <motion.tr
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3) }}
      className="border-b border-line last:border-0 hover:bg-paper/70 transition-colors"
    >
      <td className="px-4 py-3 font-mono text-xs text-ink">{row.containerType.code}</td>
      <td className="px-4 py-3 text-ink">{row.containerType.label}</td>
      <td className="px-4 py-3"><Badge value={row.containerType.isActive ? 'active' : 'inactive'} /></td>
      <td className="px-4 py-3 w-32">
        {canUpdate ? (
          <input
            type="number"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full border border-ink/20 bg-paper px-3 py-1.5 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-rust"
          />
        ) : (
          <span className="font-mono text-ink">{row.availableCount}</span>
        )}
      </td>
      {canUpdate && (
        <td className="px-4 py-3">
          <button
            onClick={() => onSave(row.containerType._id, Number(value))}
            disabled={!dirty || saving}
            className="flex h-8 w-8 items-center justify-center text-muted transition-colors hover:bg-stamp/10 hover:text-stamp disabled:opacity-30"
            title="Save"
          >
            <FaSave className="text-xs" />
          </button>
        </td>
      )}
    </motion.tr>
  )
}

export default function StockTable({ rows = [], canUpdate = false, savingId, onSave }) {
  return (
    <div className="overflow-x-auto border border-ink/15 bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-ink text-left font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            <th className="px-4 py-3">Code</th>
            <th className="px-4 py-3">Label</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Available</th>
            {canUpdate && <th className="px-4 py-3">Save</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <StockRow
              key={row.containerType._id}
              row={row}
              index={i}
              canUpdate={canUpdate}
              saving={savingId === row.containerType._id}
              onSave={onSave}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
