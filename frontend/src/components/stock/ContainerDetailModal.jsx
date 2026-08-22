'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FaTimes, FaTrash } from 'react-icons/fa'
import * as stockApi from '@/services/stock'
import { useToast } from '@/components/ui/Toast'
import { PageLoader } from '@/components/ui/Spinner'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'

export default function ContainerDetailModal({ group, onClose, canUpdate, onChanged }) {
  const toast = useToast()
  const [containers, setContainers] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = () => {
    if (!group) return
    stockApi
      .getContainers({ containerType: group.containerType._id, nvocc: group.nvocc._id })
      .then(setContainers)
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group])

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await stockApi.deleteContainer(deleteTarget._id)
      toast('Container deleted', 'success')
      setDeleteTarget(null)
      load()
      onChanged?.()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AnimatePresence>
      {group && (
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
            className="relative z-10 w-full max-w-2xl border border-ink/30 bg-card p-6 shadow-[4px_4px_0_0_var(--color-ink)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
              <div>
                <h3 className="font-display text-lg font-bold uppercase tracking-wide text-ink">
                  {group.containerType.code} — {group.nvocc.name}
                </h3>
                <p className="mt-1 text-sm text-muted">{group.containerType.label}</p>
              </div>
              <button onClick={onClose} className="text-muted transition-colors hover:text-ink">
                <FaTimes />
              </button>
            </div>

            <div className="mt-4 max-h-96 overflow-y-auto">
              {loading ? (
                <PageLoader />
              ) : containers.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">No containers found.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-ink text-left font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                      <th className="px-3 py-2">Container Number</th>
                      <th className="px-3 py-2">Status</th>
                      {canUpdate && <th className="px-3 py-2 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {containers.map((c) => (
                      <tr key={c._id} className="border-b border-line last:border-0">
                        <td className="px-3 py-2 font-mono text-ink">{c.containerNumber}</td>
                        <td className="px-3 py-2"><Badge value={c.status} /></td>
                        {canUpdate && (
                          <td className="px-3 py-2">
                            <div className="flex justify-end">
                              <button
                                onClick={() => setDeleteTarget(c)}
                                disabled={c.status === 'allocated'}
                                className="flex h-8 w-8 items-center justify-center text-muted transition-colors hover:bg-brick/10 hover:text-brick disabled:opacity-30"
                                title={c.status === 'allocated' ? 'Allocated — cannot delete' : 'Delete'}
                              >
                                <FaTrash className="text-xs" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>

          <Modal
            isOpen={!!deleteTarget}
            onClose={() => setDeleteTarget(null)}
            onConfirm={handleDelete}
            title="Delete this container?"
            message={`This will permanently delete container "${deleteTarget?.containerNumber || ''}" from stock. This cannot be undone.`}
            confirmLabel="Delete container"
            danger
            loading={deleting}
          />
        </div>
      )}
    </AnimatePresence>
  )
}
