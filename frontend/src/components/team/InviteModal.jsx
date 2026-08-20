'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FaTimes } from 'react-icons/fa'
import Select from '@/components/ui/Select'

export default function InviteModal({ isOpen, onClose, onInvite, roles = [], submitting = false }) {
  const [email, setEmail] = useState('')
  const [roleId, setRoleId] = useState('')
  const [error, setError] = useState('')

  const roleOptions = roles.map((r) => ({ value: r._id, label: r.name }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await onInvite({ email, roleId })
      setEmail('')
      setRoleId('')
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
            className="relative z-10 w-full max-w-sm border border-ink/20 bg-card p-6 shadow-[4px_4px_0_0_var(--color-ink)]"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold uppercase tracking-wide text-ink">Invite teammate</h3>
              <button onClick={onClose} className="text-muted transition-colors hover:text-ink">
                <FaTimes />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full border border-ink/20 bg-paper px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust"
                />
              </div>
              <Select label="Role" required placeholder="Select role" options={roleOptions} value={roleId} onChange={setRoleId} />
              {error && <p className="font-mono text-xs text-brick">{error}</p>}
              <button
                type="submit"
                disabled={submitting || !roleId}
                className="w-full bg-rust px-4 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-rust-dark disabled:opacity-50"
              >
                {submitting ? 'Sending…' : 'Send invitation'}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
