'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FaTimes } from 'react-icons/fa'
import * as stockApi from '@/services/stock'
import { useToast } from '@/components/ui/Toast'
import Select from '@/components/ui/Select'

export default function AddStockModal({ isOpen, onClose, onAdded, containerTypes = [], nvoccs = [], depots = [] }) {
  const toast = useToast()
  const [containerType, setContainerType] = useState('')
  const [nvocc, setNvocc] = useState('')
  const [depot, setDepot] = useState('')
  const [quantity, setQuantity] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const typeOptions = containerTypes.map((t) => ({ value: t._id, label: `${t.code} — ${t.label}` }))
  const nvoccOptions = nvoccs.map((n) => ({ value: n._id, label: n.name }))
  const depotOptions = depots.map((d) => ({ value: d._id, label: d.name }))

  const reset = () => {
    setContainerType('')
    setNvocc('')
    setDepot('')
    setQuantity('')
    setError('')
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!containerType || !nvocc || !depot) {
      setError('Select an NVOCC, a depot, and a container type')
      return
    }
    const qty = Number(quantity)
    if (!Number.isInteger(qty) || qty < 1) {
      setError('Quantity must be a whole number of at least 1')
      return
    }
    setSaving(true)
    try {
      const data = await stockApi.quickAddStock({ containerType, nvocc, depot, quantity: qty })
      toast(`${data.createdCount} container(s) added to stock`, 'success')
      reset()
      onAdded?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-ink/60" onClick={handleClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.15 }}
            className="relative z-10 w-full max-w-sm border border-ink/30 bg-card p-6 shadow-[4px_4px_0_0_var(--color-ink)]"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-lg font-bold uppercase tracking-wide text-ink">Add Stock</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Registers new container units without real container numbers — use Excel import instead when you have actual numbers to record.
                </p>
              </div>
              <button onClick={handleClose} className="text-muted transition-colors hover:text-ink">
                <FaTimes />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Select label="NVOCC" options={nvoccOptions} value={nvocc} onChange={setNvocc} placeholder="Select NVOCC" required />
              <Select label="Depot" options={depotOptions} value={depot} onChange={setDepot} placeholder="Select depot" required />
              <Select label="Container Type" options={typeOptions} value={containerType} onChange={setContainerType} placeholder="Select container type" required />
              <div>
                <label className="mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                  Quantity <span className="text-rust">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                  className="w-full border border-ink/30 bg-paper px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust"
                />
              </div>
              {error && <p className="font-mono text-xs text-brick">{error}</p>}
              <button
                type="submit"
                disabled={saving}
                className="w-full bg-rust px-4 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-rust-dark disabled:opacity-50"
              >
                {saving ? 'Adding…' : 'Add Stock'}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
