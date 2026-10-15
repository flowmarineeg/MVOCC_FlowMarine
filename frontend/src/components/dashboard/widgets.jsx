'use client'

// Small, dependency-free dashboard building blocks: cards, KPI tiles and calm SVG / CSS charts.
// Colours come from the --color-chart-* tokens in globals.css.

export const SERIES = ['var(--color-chart-1)', 'var(--color-chart-2)', 'var(--color-chart-3)', 'var(--color-chart-4)', 'var(--color-chart-5)']

export function Card({ title, description, action, children, className = '' }) {
  return (
    <section className={`card-surface flex flex-col ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-5 pb-1 pt-5">
          <div>
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="flex-1 px-5 pb-5 pt-3">{children}</div>
    </section>
  )
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'info', loading = false }) {
  const tones = {
    info: 'bg-rust/10 text-rust',
    success: 'bg-stamp/10 text-stamp',
    warning: 'bg-signal/10 text-signal',
    neutral: 'bg-ink/5 text-muted',
  }
  return (
    <div className="card-surface fade-up p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{label}</p>
        {Icon && (
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>
            <Icon className="text-[13px]" />
          </span>
        )}
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-ink">{loading ? <span className="inline-block h-8 w-16 animate-pulse rounded bg-ink/10" /> : value}</p>
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  )
}

// Vertical bars with soft gridlines. data: [{ label, value }]
export function BarChart({ data, height = 180, color = SERIES[0], unit = '' }) {
  // round the scale up to a multiple of 4 so the three gridline labels are always whole, distinct numbers
  const top = Math.max(1, ...data.map((d) => d.value))
  const max = top <= 4 ? 4 : Math.ceil(top / 4) * 4
  const ticks = [1, 0.5, 0]
  return (
    <div role="img" aria-label={`Bar chart: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`}>
      <div className="relative flex" style={{ height }}>
        <div className="absolute inset-0 flex flex-col justify-between">
          {ticks.map((t) => (
            <div key={t} className="flex items-center gap-2">
              <span className="w-7 text-right text-[11px] text-muted">{Math.round(max * t)}</span>
              <span className="h-px flex-1 bg-line" />
            </div>
          ))}
        </div>
        <div className="relative ml-9 flex flex-1 items-end justify-around gap-3 pb-px">
          {data.map((d, i) => (
            <div key={d.label} className="group flex h-full flex-1 flex-col items-center justify-end">
              <span className="mb-1 text-xs font-medium text-ink opacity-0 transition-opacity group-hover:opacity-100">{d.value}{unit}</span>
              <div
                className="chart-bar w-full max-w-9 rounded-t-md"
                title={`${d.label}: ${d.value}${unit}`}
                style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 3 : 0, backgroundColor: color, animationDelay: `${i * 50}ms` }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="ml-9 mt-2 flex justify-around gap-3">
        {data.map((d) => <span key={d.label} className="flex-1 text-center text-xs text-muted">{d.label}</span>)}
      </div>
    </div>
  )
}

// Ring chart with the total in the middle. data: [{ label, value, color? }]
export function DonutChart({ data, centerLabel = 'Total' }) {
  const total = data.reduce((t, d) => t + d.value, 0)
  const R = 52
  const C = 2 * Math.PI * R
  let offset = 0
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative h-36 w-36 shrink-0" role="img" aria-label={`Donut chart: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`}>
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <circle cx="70" cy="70" r={R} fill="none" stroke="var(--color-line)" strokeWidth="14" />
          {total > 0 &&
            data.map((d, i) => {
              const len = (d.value / total) * C
              const seg = (
                <circle
                  key={d.label}
                  cx="70" cy="70" r={R} fill="none"
                  stroke={d.color || SERIES[i % SERIES.length]} strokeWidth="14"
                  strokeDasharray={`${Math.max(len - 2, 0)} ${C - Math.max(len - 2, 0)}`}
                  strokeDashoffset={-offset}
                />
              )
              offset += len
              return d.value ? seg : null
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold text-ink">{total}</span>
          <span className="text-xs text-muted">{centerLabel}</span>
        </div>
      </div>
      <ul className="w-full space-y-2 text-sm">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-muted">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: d.color || SERIES[i % SERIES.length] }} />
              {d.label}
            </span>
            <span className="font-medium text-ink">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Ranked horizontal bars. data: [{ label, value, hint? }]
export function BarList({ data, color = SERIES[0], empty = 'No data yet' }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  if (data.length === 0) return <p className="py-8 text-center text-sm text-muted">{empty}</p>
  return (
    <ul className="space-y-3.5">
      {data.map((d, i) => (
        <li key={d.label}>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="text-ink">{d.label}</span>
            <span className="font-medium text-ink">{d.value}{d.hint && <span className="ml-1.5 font-normal text-muted">{d.hint}</span>}</span>
          </div>
          <div className="h-2 rounded-full bg-ink/[0.06]">
            <div className="chart-hbar h-2 rounded-full" style={{ width: `${(d.value / max) * 100}%`, backgroundColor: d.color || color, animationDelay: `${i * 60}ms` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

// Two-segment bar per row (e.g. available vs allocated containers). data: [{ label, a, b }]
export function SplitBars({ data, aLabel, bLabel }) {
  if (data.length === 0) return <p className="py-8 text-center text-sm text-muted">No containers in stock yet</p>
  return (
    <div>
      <div className="mb-3 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SERIES[1] }} />{aLabel}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SERIES[0] }} />{bLabel}</span>
      </div>
      <ul className="space-y-3.5">
        {data.map((d) => {
          const total = d.a + d.b
          return (
            <li key={d.label}>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="data-id text-ink">{d.label}</span>
                <span className="text-muted"><span className="font-medium text-ink">{d.a}</span> free of {total}</span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-ink/[0.06]">
                <div className="chart-hbar h-2" style={{ width: `${total ? (d.a / total) * 100 : 0}%`, backgroundColor: SERIES[1] }} />
                <div className="chart-hbar h-2" style={{ width: `${total ? (d.b / total) * 100 : 0}%`, backgroundColor: SERIES[0] }} />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
