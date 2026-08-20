'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FaExclamationTriangle, FaTimes } from 'react-icons/fa'

export default function Modal({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger = false, loading = false }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    if (isOpen) window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-ink/60"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.15 }}
            className={`relative z-10 w-full max-w-md border bg-card p-6 shadow-[4px_4px_0_0_var(--color-ink)] ${danger ? 'border-brick/40' : 'border-ink/20'}`}
          >
            <div className="flex items-start gap-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center border-2 ${danger ? 'border-brick text-brick' : 'border-rust text-rust'}`}>
                <FaExclamationTriangle />
              </div>
              <div className="flex-1 pt-1">
                <h3 className="font-display text-lg font-bold uppercase tracking-wide text-ink">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{message}</p>
              </div>
              <button onClick={onClose} className="text-muted transition-colors hover:text-ink">
                <FaTimes />
              </button>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={onClose}
                disabled={loading}
                className="border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-ink/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className={`px-4 py-2 text-sm font-semibold text-card transition-colors disabled:opacity-50 ${danger ? 'bg-brick hover:bg-brick/90' : 'bg-rust hover:bg-rust-dark'}`}
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
