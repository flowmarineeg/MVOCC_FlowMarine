'use client'

import { FaShip } from 'react-icons/fa'

export default function EmptyState({ title = 'No records found', message = 'Try adjusting your filters or create a new entry.', action }) {
  return (
    <div className="flex flex-col items-center justify-center border border-dashed border-ink/35 bg-card px-4 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center border-2 border-ink/25 text-ink/30">
        <FaShip className="text-xl" />
      </div>
      <h3 className="font-display text-lg font-bold uppercase tracking-wide text-ink">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted">{message}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
