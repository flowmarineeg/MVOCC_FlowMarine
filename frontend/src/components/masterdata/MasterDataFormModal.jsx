'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FaTimes } from 'react-icons/fa'

export default function MasterDataFormModal({ isOpen, onClose, onSave, item, fields, title, saving = false }) {
  const [values, setValues] = useState(() =>
    fields.reduce((acc, f) => {
      let val = item?.[f.key] || ''
      if (f.type === 'date' && val) val = String(val).slice(0, 10)
      return { ...acc, [f.key]: val }
    }, {})
  )
  const [error, setError] = useState('')

  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await onSave(values)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-ink/60" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.15 }}
            className="relative z-10 w-full max-w-sm border border-ink/30 bg-card p-6 shadow-[4px_4px_0_0_var(--color-ink)]"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold uppercase tracking-wide text-ink">{title}</h3>
              <button onClick={onClose} className="text-muted transition-colors hover:text-ink">
                <FaTimes />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {fields.map((f) => (
                <div key={f.key}>
                  <label className="mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                    {f.label} {f.required !== false && <span className="text-rust">*</span>}
                  </label>
                  {f.type === 'select' ? (
                    <select
                      value={values[f.key]}
                      onChange={set(f.key)}
                      required={f.required !== false}
                      className="w-full border border-ink/30 bg-paper px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust"
                    >
                      <option value="">Select…</option>
                      {(f.options || []).map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={f.type || 'text'}
                      value={values[f.key]}
                      onChange={set(f.key)}
                      required={f.required !== false}
                      className="w-full border border-ink/30 bg-paper px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust"
                    />
                  )}
                </div>
              ))}
              {error && <p className="font-mono text-xs text-brick">{error}</p>}
              <button
                type="submit"
                disabled={saving}
                className="w-full bg-rust px-4 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-rust-dark disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
