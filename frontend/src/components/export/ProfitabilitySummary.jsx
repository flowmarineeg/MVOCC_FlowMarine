'use client'

import { FaExclamationTriangle } from 'react-icons/fa'

const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00')

export default function ProfitabilitySummary({ totals, buyingCurrency = 'USD', sellingCurrency = 'USD' }) {
  const { totalBuyingCost, totalSellingPrice, netProfit, profitMarginPercent, belowMinMargin } = totals

  return (
    <div className={`border p-4 sm:p-5 ${belowMinMargin ? 'border-brick bg-brick/5' : 'border-ink/25 bg-paper/60'}`}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">Total Buying</p>
          <p className="mt-1 font-mono text-lg font-bold text-ink">{buyingCurrency} {fmt(totalBuyingCost)}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">Total Selling</p>
          <p className="mt-1 font-mono text-lg font-bold text-ink">{sellingCurrency} {fmt(totalSellingPrice)}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">Net Profit</p>
          <p className={`mt-1 font-mono text-lg font-bold ${netProfit < 0 ? 'text-brick' : 'text-stamp'}`}>
            {sellingCurrency} {fmt(netProfit)}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">Margin %</p>
          <p className={`mt-1 font-mono text-lg font-bold ${belowMinMargin ? 'text-brick' : 'text-stamp'}`}>
            {fmt(profitMarginPercent)}%
          </p>
        </div>
      </div>
      {belowMinMargin && (
        <p className="mt-3 flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wide text-brick">
          <FaExclamationTriangle className="text-[11px]" /> Below minimum margin — approving this quote requires manager sign-off
        </p>
      )}
    </div>
  )
}
