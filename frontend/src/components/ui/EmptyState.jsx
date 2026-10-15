'use client'

import { FaShip } from 'react-icons/fa'

export default function EmptyState({ title = 'No records found', message = 'Try adjusting your filters or create a new entry.', action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-card px-4 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-ink/5 text-muted">
        <FaShip className="text-xl" />
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted">{message}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
