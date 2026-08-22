'use client'

function PillGroup({ title, totals, tone }) {
  const entries = Object.entries(totals || {})
  const tones = {
    ink: 'border-ink/35 text-ink',
    rust: 'border-rust/40 text-rust',
    stamp: 'border-stamp/40 text-stamp',
  }
  return (
    <div>
      <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{title}</p>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">No data</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {entries.map(([key, count]) => (
            <span
              key={key}
              className={`inline-flex items-center gap-1.5 border px-2.5 py-1 font-mono text-xs font-semibold ${tones[tone]}`}
            >
              {key}
              <span className="text-ink/30">/</span>
              {count}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PreviewSummaryHeader({ summary }) {
  return (
    <div className="border border-ink/25 bg-card">
      <div className="border-t-[3px] border-rust" />
      <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-3">
        <PillGroup title="Container Types" totals={summary?.containerTotals} tone="ink" />
        <PillGroup title="POL Totals" totals={summary?.polTotals} tone="rust" />
        <PillGroup title="POD Totals" totals={summary?.podTotals} tone="stamp" />
      </div>
    </div>
  )
}
