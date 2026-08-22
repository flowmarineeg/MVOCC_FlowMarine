'use client'

import { FaChevronLeft, FaChevronRight } from 'react-icons/fa'

export default function Pagination({ page, pages, total, limit, onPageChange, onLimitChange }) {
  if (pages <= 1 && total <= limit) return null
  return (
    <div className="flex flex-col items-center justify-between gap-3 px-1 py-3 font-mono text-xs sm:flex-row">
      <div className="flex items-center gap-2 text-muted">
        <span>Show</span>
        <select
          value={limit}
          onChange={(e) => onLimitChange(Number(e.target.value))}
          className="border border-ink/30 bg-card px-2 py-1 text-ink focus:outline-none focus:ring-1 focus:ring-rust"
        >
          {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span>of <strong className="text-ink">{total}</strong> records</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="flex h-8 w-8 items-center justify-center border border-ink/30 text-muted transition-colors hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <FaChevronLeft size={11} />
        </button>
        {Array.from({ length: pages }, (_, i) => i + 1)
          .filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1)
          .reduce((acc, p, idx, arr) => {
            if (idx > 0 && arr[idx - 1] !== p - 1) acc.push('...')
            acc.push(p)
            return acc
          }, [])
          .map((item, idx) =>
            item === '...' ? (
              <span key={`dots-${idx}`} className="flex h-8 w-8 items-center justify-center text-muted">…</span>
            ) : (
              <button
                key={item}
                onClick={() => onPageChange(item)}
                className={`flex h-8 w-8 items-center justify-center border text-sm font-semibold transition-colors ${page === item ? 'border-ink bg-ink text-paper' : 'border-ink/30 text-ink hover:bg-ink/5'}`}
              >
                {item}
              </button>
            )
          )}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
          className="flex h-8 w-8 items-center justify-center border border-ink/30 text-muted transition-colors hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <FaChevronRight size={11} />
        </button>
      </div>
    </div>
  )
}
