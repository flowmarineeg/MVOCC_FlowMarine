'use client'

import { FaPlus, FaTrash, FaExclamationTriangle } from 'react-icons/fa'
import Select from '@/components/ui/Select'

export default function ContainerSelector({ containerTypes = [], stockMap = {}, showStock = true, value = [], onChange }) {
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

  // Two rows can share the same container type (e.g. added separately, or
  // pending the backend's one-row-per-type merge on submit) — sum requested
  // quantity per type across all rows so the stock check reflects the real
  // combined demand, not just what a single row asks for on its own.
  const totalsByType = rows.reduce((acc, r) => {
    if (!r.containerType) return acc
    acc[r.containerType] = (acc[r.containerType] || 0) + (Number(r.quantity) || 0)
    return acc
  }, {})

  return (
    <div className="space-y-2.5">
      {rows.map((row, index) => {
        // Once the form is on screen, stockMap is fully loaded (the parent
        // page gates rendering on that) — a type absent from it genuinely
        // has zero units in stock, not "unknown", so treat missing as 0
        // rather than as no restriction. Quotation stage deliberately skips
        // this check entirely (showStock=false) — it doesn't pass a
        // stockMap at all, and stockMap's own {} default would otherwise
        // read as "zero available" for every type and show a false warning.
        const available = stockMap[row.containerType] ?? 0
        const totalRequested = totalsByType[row.containerType] || 0
        const overStock = showStock && !!row.containerType && totalRequested > available
        const sharedType = row.containerType && rows.filter((r) => r.containerType === row.containerType).length > 1
        return (
          <div
            key={index}
            className={`flex flex-col gap-2.5 border bg-paper/60 p-3 sm:flex-row sm:items-start ${overStock ? 'border-brick' : 'border-ink/25'}`}
          >
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
                className={`w-full border bg-card px-3.5 py-2.5 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-rust ${overStock ? 'border-brick' : 'border-ink/30'}`}
                placeholder="Qty"
              />
            </div>
            <div className="flex items-center gap-2 sm:pt-2.5">
              {showStock && row.containerType && (
                <span className={`inline-flex items-center gap-1 whitespace-nowrap border px-2 py-1 font-mono text-[11px] font-medium ${overStock ? 'border-brick text-brick' : 'border-ink/25 text-muted'}`}>
                  {overStock && <FaExclamationTriangle className="text-[10px]" />}
                  AVAIL {available}{sharedType && ` · NEED ${totalRequested}`}
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
