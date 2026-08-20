'use client'

import { motion } from 'framer-motion'
import { FaEdit, FaToggleOn, FaToggleOff } from 'react-icons/fa'
import Badge from '@/components/ui/Badge'

export default function MasterDataTable({ items = [], fields, canUpdate = false, onEdit, onToggle, busyId }) {
  return (
    <div className="overflow-x-auto border border-ink/15 bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-ink text-left font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            {fields.map((f) => (
              <th key={f.key} className="px-4 py-3">{f.label}</th>
            ))}
            <th className="px-4 py-3">Status</th>
            {canUpdate && <th className="px-4 py-3 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <motion.tr
              key={item._id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3) }}
              className="border-b border-line last:border-0 hover:bg-paper/70 transition-colors"
            >
              {fields.map((f) => (
                <td key={f.key} className="px-4 py-3 text-ink">{item[f.key]}</td>
              ))}
              <td className="px-4 py-3"><Badge value={item.isActive ? 'active' : 'inactive'} /></td>
              {canUpdate && (
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onEdit(item)}
                      disabled={busyId === item._id}
                      className="flex h-8 w-8 items-center justify-center text-muted transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-40"
                      title="Edit"
                    >
                      <FaEdit className="text-xs" />
                    </button>
                    <button
                      onClick={() => onToggle(item)}
                      disabled={busyId === item._id}
                      className={`flex h-8 w-8 items-center justify-center transition-colors disabled:opacity-40 ${
                        item.isActive ? 'text-muted hover:bg-brick/10 hover:text-brick' : 'text-muted hover:bg-stamp/10 hover:text-stamp'
                      }`}
                      title={item.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {item.isActive ? <FaToggleOn className="text-sm" /> : <FaToggleOff className="text-sm" />}
                    </button>
                  </div>
                </td>
              )}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
