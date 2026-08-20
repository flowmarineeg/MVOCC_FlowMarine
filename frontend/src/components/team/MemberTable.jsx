'use client'

import { motion } from 'framer-motion'
import { FaBan, FaUndo } from 'react-icons/fa'
import Badge from '@/components/ui/Badge'
import Select from '@/components/ui/Select'

const fmtDate = (d) => (d ? new Date(d).toLocaleString() : 'Never')

export default function MemberTable({ members = [], roles = [], currentUserId, canManage = false, onChangeRole, onDeactivate, onReactivate, busyId }) {
  const roleOptions = roles.map((r) => ({ value: r._id, label: r.name }))

  return (
    <div className="overflow-x-auto border border-ink/15 bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-ink text-left font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Last login</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m, i) => (
            <motion.tr
              key={m._id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3) }}
              className="border-b border-line last:border-0 hover:bg-paper/70 transition-colors"
            >
              <td className="px-4 py-3 text-ink">{m.name || <span className="text-muted">—</span>}</td>
              <td className="px-4 py-3 font-mono text-xs text-muted">{m.email}</td>
              <td className="px-4 py-3 w-44">
                {canManage ? (
                  <Select
                    options={roleOptions}
                    value={m.role?._id}
                    onChange={(roleId) => onChangeRole(m._id, roleId)}
                    disabled={busyId === m._id}
                  />
                ) : (
                  <span className="text-muted">{m.role?.name}</span>
                )}
              </td>
              <td className="px-4 py-3"><Badge value={m.status} /></td>
              <td className="px-4 py-3 font-mono text-xs text-muted">{fmtDate(m.lastLoginAt)}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  {canManage && m.status !== 'deactivated' && String(m._id) !== String(currentUserId) && (
                    <button
                      onClick={() => onDeactivate(m._id)}
                      disabled={busyId === m._id}
                      className="flex h-8 w-8 items-center justify-center text-muted transition-colors hover:bg-brick/10 hover:text-brick disabled:opacity-40"
                      title="Deactivate"
                    >
                      <FaBan className="text-xs" />
                    </button>
                  )}
                  {canManage && m.status === 'deactivated' && (
                    <button
                      onClick={() => onReactivate(m._id)}
                      disabled={busyId === m._id}
                      className="flex h-8 w-8 items-center justify-center text-muted transition-colors hover:bg-stamp/10 hover:text-stamp disabled:opacity-40"
                      title="Reactivate"
                    >
                      <FaUndo className="text-xs" />
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
