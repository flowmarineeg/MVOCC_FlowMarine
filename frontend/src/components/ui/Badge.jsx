'use client'

import { motion } from 'framer-motion'

const variants = {
  pending: { color: 'var(--color-signal)', label: 'Pending' },
  confirmed: { color: 'var(--color-stamp)', label: 'Confirmed' },
  cancelled: { color: 'var(--color-brick)', label: 'Cancelled' },
  PENDING: { color: 'var(--color-muted)', label: 'Manifest Pending' },
  SUBMITTED: { color: 'var(--color-signal)', label: 'Submitted' },
  CONFIRMED: { color: 'var(--color-stamp)', label: 'Confirmed' },
  active: { color: 'var(--color-stamp)', label: 'Active' },
  inactive: { color: 'var(--color-muted)', label: 'Inactive' },
  invited: { color: 'var(--color-signal)', label: 'Invited' },
  deactivated: { color: 'var(--color-brick)', label: 'Deactivated' },
  refused: { color: 'var(--color-brick)', label: 'Refused' },
  expired: { color: 'var(--color-muted)', label: 'Expired' },
  revoked: { color: 'var(--color-muted)', label: 'Revoked' },
  accepted: { color: 'var(--color-stamp)', label: 'Accepted' },
  SUCCESS: { color: 'var(--color-stamp)', label: 'Success' },
  FAILURE: { color: 'var(--color-brick)', label: 'Failure' },
  available: { color: 'var(--color-stamp)', label: 'Available' },
  allocated: { color: 'var(--color-signal)', label: 'Allocated' },
  open: { color: 'var(--color-signal)', label: 'Open' },
  in_progress: { color: 'var(--color-signal)', label: 'In Progress' },
  completed: { color: 'var(--color-stamp)', label: 'Completed' },
  closed_invoiced: { color: 'var(--color-muted)', label: 'Closed - Invoiced' },
  draft: { color: 'var(--color-muted)', label: 'Draft' },
  sent: { color: 'var(--color-signal)', label: 'Sent' },
  negotiation: { color: 'var(--color-signal)', label: 'Negotiation' },
  approved: { color: 'var(--color-stamp)', label: 'Approved' },
  rejected: { color: 'var(--color-brick)', label: 'Rejected' },
  job_created: { color: 'var(--color-stamp)', label: 'Job Created' },
  Pending: { color: 'var(--color-signal)', label: 'Pending' },
  Confirmed: { color: 'var(--color-stamp)', label: 'Confirmed' },
}

// The "ink stamp" — this app's signature status mark. A booking's status
// is literally stamped onto its record at each SOP step (confirm/cancel),
// so the UI mirrors that instead of a generic pill badge.
export default function Badge({ value, className = '' }) {
  const v = variants[value] || { color: 'var(--color-muted)', label: value }
  return (
    <motion.span
      key={value}
      initial={{ scale: 1.5, rotate: -9, opacity: 0 }}
      animate={{ scale: 1, rotate: -4, opacity: 0.94 }}
      transition={{ duration: 0.32, ease: [0.2, 0.8, 0.3, 1] }}
      style={{ color: v.color, borderColor: v.color, outlineColor: v.color }}
      className={`grain mix-blend-multiply inline-flex w-fit items-center justify-center whitespace-nowrap border-2 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] outline outline-1 outline-offset-2 ${className}`}
    >
      {v.label}
    </motion.span>
  )
}
