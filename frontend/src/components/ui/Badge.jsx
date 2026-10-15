'use client'

// tone -> the colour token the pill is tinted with
const TONES = {
  success: 'var(--color-stamp)',
  warning: 'var(--color-signal)',
  danger: 'var(--color-brick)',
  info: 'var(--color-rust)',
  neutral: 'var(--color-muted)',
}

const variants = {
  pending: { tone: 'warning', label: 'Pending' },
  confirmed: { tone: 'success', label: 'Confirmed' },
  cancelled: { tone: 'danger', label: 'Cancelled' },
  PENDING: { tone: 'neutral', label: 'Manifest Pending' },
  SUBMITTED: { tone: 'warning', label: 'Submitted' },
  CONFIRMED: { tone: 'success', label: 'Confirmed' },
  active: { tone: 'success', label: 'Active' },
  inactive: { tone: 'neutral', label: 'Inactive' },
  invited: { tone: 'warning', label: 'Invited' },
  deactivated: { tone: 'danger', label: 'Deactivated' },
  refused: { tone: 'danger', label: 'Refused' },
  expired: { tone: 'neutral', label: 'Expired' },
  revoked: { tone: 'neutral', label: 'Revoked' },
  accepted: { tone: 'success', label: 'Accepted' },
  SUCCESS: { tone: 'success', label: 'Success' },
  FAILURE: { tone: 'danger', label: 'Failure' },
  available: { tone: 'success', label: 'Available' },
  allocated: { tone: 'info', label: 'Allocated' },
  open: { tone: 'info', label: 'Open' },
  in_progress: { tone: 'warning', label: 'In Progress' },
  completed: { tone: 'success', label: 'Completed' },
  closed_invoiced: { tone: 'neutral', label: 'Closed - Invoiced' },
  draft: { tone: 'neutral', label: 'Draft' },
  sent: { tone: 'info', label: 'Sent' },
  negotiation: { tone: 'warning', label: 'Negotiation' },
  approved: { tone: 'success', label: 'Approved' },
  rejected: { tone: 'danger', label: 'Rejected' },
  job_created: { tone: 'success', label: 'Job Created' },
  Pending: { tone: 'warning', label: 'Pending' },
  Confirmed: { tone: 'success', label: 'Confirmed' },
}

// A soft status pill: tinted background, coloured dot and text. (Replaces the earlier rubber-stamp mark.)
export default function Badge({ value, className = '' }) {
  const v = variants[value] || { tone: 'neutral', label: value }
  const color = TONES[v.tone]
  return (
    <span
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 11%, white)`, borderColor: `color-mix(in srgb, ${color} 22%, white)` }}
      className={`inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {v.label}
    </span>
  )
}
