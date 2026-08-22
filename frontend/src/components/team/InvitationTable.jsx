'use client'

import { motion } from 'framer-motion'
import { FaPaperPlane, FaTrash } from 'react-icons/fa'
import Badge from '@/components/ui/Badge'

const fmtDate = (d) => (d ? new Date(d).toLocaleString() : '—')

export default function InvitationTable({ invitations = [], canInvite = false, onResend, onRevoke, busyId }) {
  return (
    <div className="overflow-x-auto border border-ink/25 bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-ink text-left font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Invited by</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Expires</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {invitations.map((inv, i) => (
            <motion.tr
              key={inv._id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3) }}
              className="border-b border-line last:border-0 hover:bg-paper/70 transition-colors"
            >
              <td className="px-4 py-3 font-mono text-xs text-ink">{inv.email}</td>
              <td className="px-4 py-3 text-muted">{inv.role?.name}</td>
              <td className="px-4 py-3 text-muted">{inv.invitedBy?.name || inv.invitedBy?.email}</td>
              <td className="px-4 py-3"><Badge value={inv.status} /></td>
              <td className="px-4 py-3 font-mono text-xs text-muted">{fmtDate(inv.expiresAt)}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  {canInvite && ['pending', 'expired'].includes(inv.status) && (
                    <button
                      onClick={() => onResend(inv._id)}
                      disabled={busyId === inv._id}
                      className="flex h-8 w-8 items-center justify-center text-muted transition-colors hover:bg-stamp/10 hover:text-stamp disabled:opacity-40"
                      title="Resend"
                    >
                      <FaPaperPlane className="text-xs" />
                    </button>
                  )}
                  {canInvite && inv.status === 'pending' && (
                    <button
                      onClick={() => onRevoke(inv._id)}
                      disabled={busyId === inv._id}
                      className="flex h-8 w-8 items-center justify-center text-muted transition-colors hover:bg-brick/10 hover:text-brick disabled:opacity-40"
                      title="Revoke"
                    >
                      <FaTrash className="text-xs" />
                    </button>
                  )}
                </div>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
