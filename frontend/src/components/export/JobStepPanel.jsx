'use client'

import { useState } from 'react'
import { FaCheckCircle, FaLock, FaExclamationTriangle } from 'react-icons/fa'
import ReasonModal from './ReasonModal'

const fmt = (d) => (d ? new Date(d).toLocaleString() : '')

// The status strip at the top of each step (PRD G5 / G1): what is still missing, the
// "Complete step" action, and "Amend" (with a reason) once it is complete.
// `stamp` = { completedAt } of this step, or null; `issues` = what stops it from completing.
export default function JobStepPanel({
  step, title, stamp, reconfirm = false, issues = [], warnings = [], canAct = false, busy = false,
  previousDone = true, hblIssued = false, onComplete, onAmend, completeLabel, hideComplete = false, children,
}) {
  const [amendOpen, setAmendOpen] = useState(false)
  const complete = !!stamp
  const ready = issues.length === 0 && previousDone

  return (
    <div className="space-y-3 border border-ink/25 bg-card p-4 sm:p-5" data-testid={`step-panel-${step}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold ${
              complete && !reconfirm ? 'bg-stamp text-card' : reconfirm ? 'bg-signal text-card' : 'bg-ink/10 text-muted'
            }`}
          >
            {complete && !reconfirm ? <FaCheckCircle /> : step}
          </span>
          <div>
            <p className="font-display text-base font-bold uppercase tracking-wide text-ink">{title}</p>
            <p className="font-mono text-[11px] text-muted" data-testid={`step-status-${step}`}>
              {reconfirm
                ? 'Re-confirm needed — an earlier step was amended'
                : complete
                  ? `Complete${stamp.completedAt ? ` · ${fmt(stamp.completedAt)}` : ''} · locked`
                  : 'In progress'}
            </p>
          </div>
        </div>

        {canAct && (
          <div className="flex items-center gap-2">
            {complete && !reconfirm && !hblIssued && (
              <button
                type="button"
                onClick={() => setAmendOpen(true)}
                disabled={busy}
                className="flex items-center gap-2 border border-brick/40 px-3.5 py-2 text-sm font-medium text-brick transition-colors hover:bg-brick/5 disabled:opacity-50"
              >
                <FaLock className="text-xs" /> Amend
              </button>
            )}
            {(!complete || reconfirm) && !hideComplete && (
              <button
                type="button"
                onClick={onComplete}
                disabled={busy || !ready}
                title={!previousDone ? `Complete Step ${step - 1} first` : issues.length ? 'Fix the items listed below first' : undefined}
                className="bg-stamp px-4 py-2 text-sm font-semibold text-card transition-colors hover:bg-stamp/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? 'Working…' : completeLabel || (reconfirm ? `Re-confirm Step ${step}` : `Complete Step ${step}`)}
              </button>
            )}
          </div>
        )}
      </div>

      {(!complete || reconfirm) && (issues.length > 0 || !previousDone) && (
        <div className="border border-signal/50 bg-signal/5 p-3" data-testid={`step-issues-${step}`}>
          <p className="mb-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-signal">Complete before this step can be finished</p>
          <ul className="list-inside list-disc space-y-0.5 text-sm text-ink">
            {!previousDone && <li>Step {step - 1} must be complete first</li>}
            {issues.map((i) => <li key={i}>{i}</li>)}
          </ul>
          <p className="mt-1.5 font-mono text-[10px] text-muted">Checks the SAVED data — save the step first.</p>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="flex gap-2 border border-ink/20 bg-paper/60 p-3 text-sm text-ink">
          <FaExclamationTriangle className="mt-0.5 shrink-0 text-signal" />
          <ul className="space-y-0.5">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}

      {children}

      <ReasonModal
        isOpen={amendOpen}
        onClose={() => setAmendOpen(false)}
        onConfirm={(reason) => { setAmendOpen(false); onAmend?.(reason) }}
        title={`Amend Step ${step}?`}
        message="The step is unlocked for editing and every later completed step is flagged for re-confirmation. The reason is kept in the audit trail."
        confirmLabel="Amend step"
        loading={busy}
      />
    </div>
  )
}
