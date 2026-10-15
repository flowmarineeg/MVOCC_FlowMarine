'use client'

import { FaCheck, FaRedoAlt } from 'react-icons/fa'

// The 5 fixed workflow steps for the merged "Booking & Job Details" page —
// see docs/BOOKING_JOB_MERGE_DATA_REPORT.md for the full field-to-step
// mapping. Navigation between steps is always free (no step ever blocks
// another); `completed` is the real step-complete stamp (Sprint 007) and
// `reconfirm` lists completed steps that need re-confirming after an Amend.
export const BOOKING_STEPS = [
  { index: 1, label: 'Preliminary S/D', fullLabel: 'Preliminary Shipping Declaration', hint: 'Cargo, customs, parties' },
  { index: 2, label: 'Booking', fullLabel: 'Booking', hint: 'Vessel, voyage, cut-offs' },
  { index: 3, label: 'Depot / Container', fullLabel: 'Depot / Container', hint: 'CRO, seals, VGM' },
  { index: 4, label: 'Final S/D', fullLabel: 'Final Shipping Declaration', hint: 'B/L wording, approval' },
  { index: 5, label: 'BL & Loading List', fullLabel: 'BL & Loading List', hint: 'HBL, documents, pre-alert' },
]

// Five equal tiles: number / check badge, step name and a one-line status. A thin progress strip on top
// fills as steps complete. Small screens scroll horizontally instead of wrapping.
// (The wrapper classes and the five <button>s are relied on by the e2e suites — keep them.)
export default function BookingStepBar({ active, onChange, completed = {}, reconfirm = [] }) {
  const doneCount = BOOKING_STEPS.filter((s) => completed[s.index] && !reconfirm.includes(s.index)).length
  return (
    <div className="overflow-x-auto border border-ink/25 bg-card" role="tablist" aria-label="Job steps">
      <div className="min-w-[44rem]">
        <div className="h-1 bg-ink/[0.06]" aria-hidden="true">
          <div className="h-1 bg-stamp transition-all duration-500" style={{ width: `${(doneCount / BOOKING_STEPS.length) * 100}%` }} />
        </div>
        <div className="flex">
          {BOOKING_STEPS.map((step, i) => {
            const isActive = step.index === active
            const needsReconfirm = reconfirm.includes(step.index)
            const isDone = !!completed[step.index] && !needsReconfirm
            const state = needsReconfirm ? 'reconfirm' : isDone ? 'done' : isActive ? 'active' : 'todo'
            const caption = needsReconfirm ? 'Re-confirm needed' : isDone ? 'Complete' : isActive ? 'In progress' : step.hint

            return (
              <button
                key={step.index}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onChange(step.index)}
                title={needsReconfirm ? `${step.fullLabel} — re-confirm needed` : step.fullLabel}
                data-complete={completed[step.index] ? 'true' : 'false'}
                data-reconfirm={needsReconfirm ? 'true' : 'false'}
                className={`group flex flex-1 flex-col items-start gap-1.5 rounded-none border-b-2 px-4 py-3.5 text-left transition-colors sm:px-5 ${
                  isActive ? 'border-rust bg-rust/[0.04]' : 'border-transparent hover:bg-ink/[0.03]'
                } ${i > 0 ? 'border-l border-l-line' : ''}`}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                      state === 'active'
                        ? 'bg-rust text-white shadow-sm'
                        : state === 'reconfirm'
                          ? 'bg-signal text-white'
                          : state === 'done'
                            ? 'bg-stamp text-white'
                            : 'bg-ink/[0.07] text-muted group-hover:bg-ink/10'
                    }`}
                  >
                    {state === 'done' ? <FaCheck className="text-[10px]" /> : state === 'reconfirm' ? <FaRedoAlt className="text-[9px]" /> : step.index}
                  </span>
                  <span className={`whitespace-nowrap text-sm ${isActive ? 'font-semibold text-ink' : 'font-medium text-ink/80'}`}>{step.label}</span>
                </span>
                <span
                  className={`pl-[2.375rem] text-xs ${
                    state === 'reconfirm' ? 'font-medium text-signal' : state === 'done' ? 'text-stamp' : isActive ? 'text-rust' : 'text-muted'
                  }`}
                >
                  {caption}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
