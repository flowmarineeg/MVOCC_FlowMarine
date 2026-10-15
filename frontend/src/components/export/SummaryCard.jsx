'use client'

const labelCls = 'mb-1 block font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted'

// The read-only "cascade" blocks of the PRD (Quotation Summary, Job Summary, Requirement ...):
// values typed in an earlier step, shown again here but never editable (G1).
export default function SummaryCard({ title, items = [], note, testId }) {
  const shown = items.filter((i) => i && i.show !== false)
  return (
    <div className="space-y-3 border border-ink/25 bg-paper/50 p-4 sm:p-5" data-testid={testId}>
      <p className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-rust">{title}</p>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((i) => (
          <div key={i.label}>
            <span className={labelCls}>{i.label}</span>
            <p className="min-h-[20px] text-sm text-ink">{i.value === undefined || i.value === null || i.value === '' ? '-' : i.value}</p>
          </div>
        ))}
      </div>
      {note && <p className="font-mono text-[10px] text-muted">{note}</p>}
    </div>
  )
}
