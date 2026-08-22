'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FaTimes, FaLock } from 'react-icons/fa'

export default function RolePermissionEditor({ isOpen, onClose, onSave, role, permissionsCatalog = [], saving = false }) {
  const [name, setName] = useState(role?.name || '')
  const [description, setDescription] = useState(role?.description || '')
  const [selected, setSelected] = useState(new Set(role?.permissions || []))
  const [error, setError] = useState('')

  const isSystem = role?.isSystem

  const groups = permissionsCatalog.reduce((acc, p) => {
    acc[p.group] = acc[p.group] || []
    acc[p.group].push(p)
    return acc
  }, {})

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await onSave({ name, description, permissions: Array.from(selected) })
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
            className="relative z-10 max-h-[85vh] w-full max-w-lg overflow-y-auto border border-ink/30 bg-card p-6 shadow-[4px_4px_0_0_var(--color-ink)]"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold uppercase tracking-wide text-ink">
                {role ? 'Edit role' : 'New role'}
              </h3>
              <button onClick={onClose} className="text-muted transition-colors hover:text-ink">
                <FaTimes />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                    Name {isSystem && <FaLock className="text-[10px]" />}
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isSystem}
                    required
                    className="w-full border border-ink/30 bg-paper px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Description</label>
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full border border-ink/30 bg-paper px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust"
                  />
                </div>
              </div>

              <div className="space-y-4">
                {Object.entries(groups).map(([group, perms]) => (
                  <div key={group}>
                    <p className="mb-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-rust">{group}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {perms.map((p) => (
                        <label key={p.key} className="flex items-center gap-2 text-sm text-ink">
                          <input
                            type="checkbox"
                            checked={selected.has(p.key)}
                            onChange={() => toggle(p.key)}
                            className="h-4 w-4 accent-rust"
                          />
                          {p.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {error && <p className="font-mono text-xs text-brick">{error}</p>}

              <button
                type="submit"
                disabled={saving}
                className="w-full bg-rust px-4 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-rust-dark disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save role'}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
