'use client'

import Select from '@/components/ui/Select'
import { CURRENCY_OPTIONS } from '@/constants/currencies'
import { lineSizeTotal, lineTotal, tableTotal } from '@/utils/quotationCalc'

const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00')

const cellInputCls = 'w-24 border border-ink/30 bg-card px-2 py-1.5 text-right font-mono text-sm focus:outline-none focus:ring-1 focus:ring-rust'
const thCls = 'px-2 py-2 text-right font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted'
const tdCls = 'px-2 py-1.5 text-right font-mono text-sm text-ink'

// One rate table (Origin or Destination, Buying or Selling). Columns are
// driven by `sizes` — the container sizes (20 / 40) actually present in the
// quotation — so nothing is shown for a size that isn't being shipped.
// QTY is auto-filled from the quotation's containers; typing in it overrides
// that for the line (BL / Telex / Documentation are per B/L or shipment).
export default function RateTable({
  title,
  lines,
  value,
  onChange,
  sizes,
  qtyBySize,
  currency,
  onCurrencyChange,
  baseCurrency,
  conversionRate,
  onConversionRateChange,
  conversionError,
}) {
  const custom = value.custom || []
  const needsConversion = baseCurrency && currency !== baseCurrency

  const setCell = (key, field, v) => onChange({ ...value, [key]: { ...value[key], [field]: v } })
  const addCustom = () => onChange({ ...value, custom: [...custom, { label: '', rate20: '', rate40: '', qty20: '', qty40: '' }] })
  const updateCustom = (i, patch) => onChange({ ...value, custom: custom.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) })
  const removeCustom = (i) => onChange({ ...value, custom: custom.filter((_, idx) => idx !== i) })

  const renderCells = (line, setField) =>
    sizes.map((size) => (
      <SizeCells key={size} line={line} size={size} qtyBySize={qtyBySize} setField={setField} />
    ))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{title}</h3>
        <div className="flex flex-wrap items-end gap-3">
          {needsConversion && (
            <div>
              <label className="mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                1 {currency} = ? {baseCurrency}
              </label>
              <input
                type="number"
                min="0"
                step="0.0001"
                value={conversionRate}
                onChange={(e) => onConversionRateChange(e.target.value)}
                className={`w-32 border bg-card px-3.5 py-2.5 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-rust ${conversionError ? 'border-brick' : 'border-ink/30'}`}
              />
            </div>
          )}
          <div className="w-64">
            <Select label="Currency" searchable options={CURRENCY_OPTIONS} value={currency} onChange={onCurrencyChange} />
          </div>
        </div>
      </div>
      {conversionError && <p className="font-mono text-xs text-brick">{conversionError}</p>}

      {sizes.length === 0 ? (
        <p className="text-sm text-muted">
          Select container types in Section 1 first — the 20ft / 40ft columns are detected automatically from them.
        </p>
      ) : (
        <div className="overflow-x-auto border border-ink/25">
          <table className="w-full min-w-max border-collapse">
            <thead className="bg-paper/60">
              <tr className="border-b border-ink/20">
                <th rowSpan={2} className="px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">Term</th>
                {sizes.map((size) => (
                  <th key={size} colSpan={3} className="border-l border-ink/20 px-2 py-2 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-ink">
                    {size} ft
                  </th>
                ))}
                <th rowSpan={2} className="border-l border-ink/20 px-3 py-2 text-right font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">Total</th>
                <th rowSpan={2} className="w-8" />
              </tr>
              <tr className="border-b border-ink/20">
                {sizes.map((size) => (
                  <SubHeaders key={size} />
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map(({ key, label }) => {
                const line = value[key] || {}
                return (
                  <tr key={key} className="border-b border-line">
                    <td className="px-3 py-1.5 text-sm text-ink">{label}</td>
                    {renderCells(line, (field, v) => setCell(key, field, v))}
                    <td className="border-l border-ink/20 px-3 py-1.5 text-right font-mono text-sm font-semibold text-ink">{fmt(lineTotal(line, qtyBySize))}</td>
                    <td />
                  </tr>
                )
              })}
              {custom.map((line, i) => (
                <tr key={`custom-${i}`} className="border-b border-line">
                  <td className="px-3 py-1.5">
                    <input
                      value={line.label}
                      onChange={(e) => updateCustom(i, { label: e.target.value })}
                      placeholder="Charge label"
                      className="w-full min-w-32 border border-ink/30 bg-card px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust"
                    />
                  </td>
                  {renderCells(line, (field, v) => updateCustom(i, { [field]: v }))}
                  <td className="border-l border-ink/20 px-3 py-1.5 text-right font-mono text-sm font-semibold text-ink">{fmt(lineTotal(line, qtyBySize))}</td>
                  <td className="px-1">
                    <button type="button" onClick={() => removeCustom(i)} className="px-2 py-1.5 text-muted transition-colors hover:text-brick" aria-label="Remove charge line">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-paper/60">
                <td className="px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-ink">Total</td>
                <td colSpan={sizes.length * 3} />
                <td className="border-l border-ink/20 px-3 py-2 text-right font-mono text-sm font-bold text-ink">
                  {currency} {fmt(tableTotal(value, lines, qtyBySize))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {sizes.length > 0 && (
        <button type="button" onClick={addCustom} className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-rust transition-colors hover:text-rust-dark">
          + Add charge line
        </button>
      )}
    </div>
  )
}

function SubHeaders() {
  return (
    <>
      <th className={`${thCls} border-l border-ink/20`}>Rate</th>
      <th className={thCls}>Qty</th>
      <th className={thCls}>Total</th>
    </>
  )
}

function SizeCells({ line, size, qtyBySize, setField }) {
  const auto = qtyBySize[size] || 0
  return (
    <>
      <td className="border-l border-ink/20 px-2 py-1.5 text-right">
        <input type="number" min="0" step="0.01" value={line[`rate${size}`] ?? ''} onChange={(e) => setField(`rate${size}`, e.target.value)} className={cellInputCls} />
      </td>
      <td className="px-2 py-1.5 text-right">
        <input
          type="number"
          min="0"
          value={line[`qty${size}`] ?? ''}
          onChange={(e) => setField(`qty${size}`, e.target.value)}
          placeholder={String(auto)}
          title={`Defaults to ${auto} (from the selected containers) — type a number to override`}
          className={`${cellInputCls} w-16`}
        />
      </td>
      <td className={tdCls}>{fmt(lineSizeTotal(line, size, qtyBySize))}</td>
    </>
  )
}
