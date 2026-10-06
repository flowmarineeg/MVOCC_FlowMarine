'use client'

import { CURRENCY_CODES } from '@/constants/currencies'
import { lineCurrency, lineSizeTotal, lineTotal, tableTotalsByCurrency } from '@/utils/quotationCalc'
import { newUid } from '@/utils/quotationSync'

const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00')

const cellInputCls = 'w-24 border border-ink/30 bg-card px-2 py-1.5 text-right font-mono text-sm focus:outline-none focus:ring-1 focus:ring-rust'
const thCls = 'px-2 py-2 text-right font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted'
const tdCls = 'px-2 py-1.5 text-right font-mono text-sm text-ink'

export const DEFAULT_LINE_CURRENCY = 'USD'

const hasData = (line = {}) => ['rate20', 'rate40', 'qty20', 'qty40'].some((f) => line[f] !== '' && line[f] !== undefined && line[f] !== null)

// One rate table (Origin or Destination, Buying or Selling). Columns are
// driven by `sizes` — the container sizes (20 / 40) actually present in the
// quotation — so nothing is shown for a size that isn't being shipped.
// QTY is auto-filled from the quotation's containers; typing in it overrides
// that for the line (BL / Telex / Documentation are per B/L or shipment).
// Every row has its OWN currency (next to the rates) and the footer totals
// each currency separately — nothing is converted.
// Any row — standard or added — can be removed when this quotation doesn't use
// it; removed standard rows can be restored from the "Restore row" menu.
export default function RateTable({ title, lines, value, onChange, sizes, qtyBySize }) {
  const custom = value.custom || []
  const hidden = value.hidden || []
  const visibleLines = lines.filter(({ key }) => !hidden.includes(key))
  const hiddenLines = lines.filter(({ key }) => hidden.includes(key))
  const totals = [...tableTotalsByCurrency(value, lines, qtyBySize).entries()]

  const setCell = (key, field, v) => onChange({ ...value, [key]: { ...value[key], [field]: v } })
  const addCustom = () =>
    onChange({ ...value, custom: [...custom, { uid: newUid(), label: '', rate20: '', rate40: '', qty20: '', qty40: '', currency: DEFAULT_LINE_CURRENCY }] })
  const updateCustom = (i, patch) => onChange({ ...value, custom: custom.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) })
  const removeCustom = (i) => onChange({ ...value, custom: custom.filter((_, idx) => idx !== i) })

  const removeStandard = (key, label) => {
    const line = value[key] || {}
    if (hasData(line) && typeof window !== 'undefined' && !window.confirm(`Remove "${label}"? Its values will be discarded.`)) return
    onChange({
      ...value,
      [key]: { rate20: '', rate40: '', qty20: '', qty40: '', currency: line.currency ?? DEFAULT_LINE_CURRENCY },
      hidden: [...hidden, key],
    })
  }
  const restoreStandard = (key) => key && onChange({ ...value, hidden: hidden.filter((k) => k !== key) })

  const renderCells = (line, setField) =>
    sizes.map((size) => (
      <SizeCells key={size} line={line} size={size} qtyBySize={qtyBySize} setField={setField} />
    ))

  const removeBtn = (onClick, label) => (
    <button type="button" onClick={onClick} className="px-2 py-1.5 text-muted transition-colors hover:text-brick" aria-label={label} title={label}>✕</button>
  )

  return (
    <div className="space-y-3">
      <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{title}</h3>

      {sizes.length === 0 ? (
        <p className="text-sm text-muted">
          Select container types in the Containers & Cargo card first — the 20ft / 40ft columns are detected automatically from them.
        </p>
      ) : (
        <div className="overflow-x-auto border border-ink/25">
          <table className="w-full min-w-max border-collapse">
            <thead className="bg-paper/60">
              <tr className="border-b border-ink/20">
                <th rowSpan={2} className="px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">Term</th>
                <th rowSpan={2} className="border-l border-ink/20 px-2 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">Currency</th>
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
              {visibleLines.map(({ key, label }) => {
                const line = value[key] || {}
                return (
                  <tr key={key} className="border-b border-line">
                    <td className="px-3 py-1.5 text-sm text-ink">{label}</td>
                    <td className="border-l border-ink/20 px-2 py-1.5">
                      <CurrencyCell value={line.currency} onChange={(v) => setCell(key, 'currency', v)} label={label} />
                    </td>
                    {renderCells(line, (field, v) => setCell(key, field, v))}
                    <RowTotal line={line} qtyBySize={qtyBySize} />
                    <td className="px-1">{removeBtn(() => removeStandard(key, label), `Remove ${label} row`)}</td>
                  </tr>
                )
              })}
              {custom.map((line, i) => (
                <tr key={line.uid || `custom-${i}`} className="border-b border-line">
                  <td className="px-3 py-1.5">
                    <input
                      value={line.label}
                      onChange={(e) => updateCustom(i, { label: e.target.value })}
                      placeholder="Charge label"
                      className="w-full min-w-32 border border-ink/30 bg-card px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust"
                    />
                  </td>
                  <td className="border-l border-ink/20 px-2 py-1.5">
                    <CurrencyCell value={line.currency} onChange={(v) => updateCustom(i, { currency: v })} label={line.label || 'charge'} />
                  </td>
                  {renderCells(line, (field, v) => updateCustom(i, { [field]: v }))}
                  <RowTotal line={line} qtyBySize={qtyBySize} />
                  <td className="px-1">{removeBtn(() => removeCustom(i), 'Remove charge line')}</td>
                </tr>
              ))}
              {visibleLines.length === 0 && custom.length === 0 && (
                <tr>
                  <td colSpan={sizes.length * 3 + 4} className="px-3 py-3 text-sm text-muted">No rows — add a charge line or restore a standard row below.</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-paper/60">
                <td className="px-3 py-2 align-top font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-ink">Total</td>
                <td colSpan={sizes.length * 3 + 1} />
                <td className="border-l border-ink/20 px-3 py-2 text-right font-mono text-sm font-bold text-ink" data-testid="table-totals">
                  {totals.length === 0 ? (
                    <span className="text-muted">0.00</span>
                  ) : (
                    totals.map(([currency, amount]) => (
                      <div key={currency || 'none'} className="whitespace-nowrap">
                        {currency || '—'} {fmt(amount)}
                      </div>
                    ))
                  )}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {sizes.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <button type="button" onClick={addCustom} className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-rust transition-colors hover:text-rust-dark">
            + Add charge line
          </button>
          {hiddenLines.length > 0 && (
            <select
              aria-label="Restore a removed row"
              value=""
              onChange={(e) => restoreStandard(e.target.value)}
              className="border border-ink/30 bg-card px-2 py-1 font-mono text-xs text-ink focus:outline-none focus:ring-1 focus:ring-rust"
            >
              <option value="">Restore removed row…</option>
              {hiddenLines.map(({ key, label }) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  )
}

// Native <select>: a custom dropdown would be clipped by the table's own
// horizontal-scroll wrapper. The blank option leaves the row unselected.
function CurrencyCell({ value, onChange, label }) {
  const current = lineCurrency({ currency: value })
  const known = CURRENCY_CODES.includes(current)
  return (
    <select
      aria-label={`Currency for ${label}`}
      value={current}
      onChange={(e) => onChange(e.target.value)}
      className="w-24 border border-ink/30 bg-card px-1.5 py-1.5 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-rust"
    >
      <option value="">—</option>
      {!known && current && <option value={current}>{current}</option>}
      {CURRENCY_CODES.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  )
}

function RowTotal({ line, qtyBySize }) {
  const currency = lineCurrency(line)
  return (
    <td className="border-l border-ink/20 px-3 py-1.5 text-right font-mono text-sm font-semibold text-ink">
      {currency && <span className="mr-1 text-[10px] font-normal text-muted">{currency}</span>}
      {fmt(lineTotal(line, qtyBySize))}
    </td>
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
