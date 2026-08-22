'use client'

import { FaPlus, FaTrash, FaExclamationTriangle } from 'react-icons/fa'
import Select from '@/components/ui/Select'

export default function ContainerSelector({ containerTypes = [], stockMap = {}, value = [], onChange }) {
  const rows = value.length ? value : [{ containerType: '', quantity: 1 }]

  const typeOptions = containerTypes.map((ct) => ({ value: ct._id, label: `${ct.code} — ${ct.label}` }))

  const updateRow = (index, patch) => {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    onChange(next)
  }

  const addRow = () => onChange([...rows, { containerType: '', quantity: 1 }])

  const removeRow = (index) => {
    const next = rows.filter((_, i) => i !== index)
    onChange(next.length ? next : [{ containerType: '', quantity: 1 }])
  }

  return (
    <div className="space-y-2.5">
      {rows.map((row, index) => {
        const available = stockMap[row.containerType]
        const overStock = row.containerType && Number(row.quantity) > (available ?? Infinity)
        return (
          <div key={index} className="flex flex-col gap-2.5 border border-ink/25 bg-paper/60 p-3 sm:flex-row sm:items-start">
            <div className="flex-1">
              <Select
                placeholder="Select container type"
                options={typeOptions}
                value={row.containerType}
                onChange={(v) => updateRow(index, { containerType: v })}
              />
            </div>
            <div className="w-full sm:w-28">
              <input
                type="number"
                min={1}
                value={row.quantity}
                onChange={(e) => updateRow(index, { quantity: Number(e.target.value) })}
                className="w-full border border-ink/30 bg-card px-3.5 py-2.5 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-rust"
                placeholder="Qty"
              />
            </div>
            <div className="flex items-center gap-2 sm:pt-2.5">
              {row.containerType && (
                <span className={`inline-flex items-center gap-1 whitespace-nowrap border px-2 py-1 font-mono text-[11px] font-medium ${overStock ? 'border-signal text-signal' : 'border-ink/25 text-muted'}`}>
                  {overStock && <FaExclamationTriangle className="text-[10px]" />}
                  AVAIL {available ?? '—'}
                </span>
              )}
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="flex h-9 w-9 shrink-0 items-center justify-center text-muted transition-colors hover:bg-brick/10 hover:text-brick"
              >
                <FaTrash className="text-xs" />
              </button>
            </div>
          </div>
        )
      })}
      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-rust transition-colors hover:text-rust-dark"
      >
        <FaPlus className="text-[10px]" /> Add another type
      </button>
    </div>
  )
}
