'use client'

import { FaCheck } from 'react-icons/fa'

// The 5 fixed workflow steps for the merged "Booking & Job Details" page —
// see docs/BOOKING_JOB_MERGE_DATA_REPORT.md for the full field-to-step
// mapping. Navigation between steps is always free (no step ever blocks
// another) — `completed` is a purely cosmetic, single-signal heuristic per
// step (computed by the caller), never a gate.
export const BOOKING_STEPS = [
  { index: 1, label: 'Preliminary S/D', fullLabel: 'Preliminary Shipping Declaration' },
  { index: 2, label: 'Booking', fullLabel: 'Booking' },
  { index: 3, label: 'Depot / Container', fullLabel: 'Depot / Container' },
  { index: 4, label: 'Final S/D', fullLabel: 'Final Shipping Declaration' },
  { index: 5, label: 'BL & Loading List', fullLabel: 'BL & Loading List' },
]

// completed[step.index] -> boolean. active -> current step index. Desktop:
// evenly spread left-to-right with connecting lines; small screens scroll
// horizontally instead of wrapping (per the "not a vertical list" requirement).
export default function BookingStepBar({ active, onChange, completed = {} }) {
  return (
    <div className="overflow-x-auto border border-ink/25 bg-card">
      <div className="flex min-w-max">
        {BOOKING_STEPS.map((step, i) => {
          const isActive = step.index === active
          const isDone = !!completed[step.index] && !isActive
          return (
            <button
              key={step.index}
              type="button"
              onClick={() => onChange(step.index)}
              title={step.fullLabel}
              className={`group flex flex-1 items-center gap-2.5 border-b-[3px] px-4 py-3.5 text-left transition-colors sm:px-5 ${
                isActive
                  ? 'border-rust bg-paper/70'
                  : 'border-transparent hover:border-ink/25 hover:bg-paper/40'
              } ${i > 0 ? 'border-l border-l-ink/15' : ''}`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold ${
                  isActive
                    ? 'bg-rust text-card'
                    : isDone
                      ? 'bg-stamp text-card'
                      : 'bg-ink/10 text-muted'
                }`}
              >
                {isDone ? <FaCheck className="text-[9px]" /> : step.index}
              </span>
              <span
                className={`whitespace-nowrap font-mono text-[11px] font-semibold uppercase tracking-[0.08em] sm:text-xs ${
                  isActive ? 'text-ink' : isDone ? 'text-ink/70' : 'text-muted'
                }`}
              >
                {step.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
