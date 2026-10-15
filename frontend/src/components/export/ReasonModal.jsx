'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FaExclamationTriangle, FaTimes } from 'react-icons/fa'

// A confirm dialog that also collects a written reason (Amend, roll-over, re-issue ...).
// The reason box resets every time the dialog opens.
export default function ReasonModal({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Confirm', loading = false, minLength = 3 }) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (!isOpen) return undefined
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  const valid = reason.trim().length >= minLength
  const close = () => { setReason(''); onClose() }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-ink/40" onClick={close} />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.15 }}
            className="relative z-10 w-full max-w-md border border-ink/30 bg-card p-6 shadow-xl"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-rust text-rust"><FaExclamationTriangle /></div>
              <div className="flex-1 pt-1">
                <h3 className="font-display text-lg font-bold uppercase tracking-wide text-ink">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{message}</p>
              </div>
              <button type="button" onClick={close} className="text-muted transition-colors hover:text-ink"><FaTimes /></button>
            </div>
            <label className="mt-4 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
              Reason <span className="text-rust">*</span>
              <textarea
                autoFocus
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                aria-label="Reason"
                placeholder="Why is this needed? (kept in the audit trail)"
                className="mt-1.5 w-full border border-ink/30 bg-card px-3.5 py-2.5 text-sm font-normal normal-case tracking-normal text-ink focus:outline-none focus:ring-1 focus:ring-rust"
              />
            </label>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={close} disabled={loading} className="border border-ink/30 px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-ink/5 disabled:opacity-50">Cancel</button>
              <button
                type="button"
                onClick={() => { const text = reason.trim(); setReason(''); onConfirm(text) }}
                disabled={loading || !valid}
                className="bg-rust px-4 py-2 text-sm font-semibold text-card transition-colors hover:bg-rust-dark disabled:opacity-50"
              >
                {loading ? 'Processing…' : confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
