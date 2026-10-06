'use client'

import { FaExclamationTriangle } from 'react-icons/fa'

const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00')

const thCls = 'px-3 py-2 text-right font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted'

// Profit per currency — every row of the rate tables carries its own currency
// and nothing is converted between them.
export default function ProfitabilitySummary({ totals }) {
  const { rows = [], belowMinMargin } = totals

  return (
    <div className={`border p-4 sm:p-5 ${belowMinMargin ? 'border-brick bg-brick/5' : 'border-ink/25 bg-paper/60'}`}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nothing priced yet — add rates to the Buying and Selling tables.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse" data-testid="profit-table">
            <thead>
              <tr className="border-b border-ink/20">
                <th className="px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">Currency</th>
                <th className={thCls}>Total Buying</th>
                <th className={thCls}>Total Selling</th>
                <th className={thCls}>Net Profit</th>
                <th className={thCls}>Margin %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.currency || 'none'} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 font-mono text-sm font-bold text-ink">{r.currency || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-sm text-ink">{fmt(r.buying)}</td>
                  <td className="px-3 py-2 text-right font-mono text-sm text-ink">{fmt(r.selling)}</td>
                  <td className={`px-3 py-2 text-right font-mono text-sm font-bold ${r.netProfit < 0 ? 'text-brick' : 'text-stamp'}`}>{fmt(r.netProfit)}</td>
                  <td className={`px-3 py-2 text-right font-mono text-sm font-bold ${r.belowMinMargin ? 'text-brick' : 'text-stamp'}`}>{fmt(r.marginPercent)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {belowMinMargin && (
        <p className="mt-3 flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wide text-brick">
          <FaExclamationTriangle className="text-[11px]" /> Below minimum margin — approving this quote requires manager sign-off
        </p>
      )}
    </div>
  )
}
