'use client'

import { useEffect, useRef, useState } from 'react'
import { FaChevronDown, FaCheck, FaSearch, FaTimes } from 'react-icons/fa'

export default function Select({
  label,
  options = [],
  value,
  onChange,
  placeholder = 'Select...',
  searchable = false,
  error,
  disabled = false,
  required = false,
  clearable = false, // shows an ✕ that sets the value back to '' (unselected)
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = options.find((o) => o.value === value)
  const filtered = searchable && query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  return (
    <div ref={rootRef} className="relative">
      {label && (
        <label className="mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
          {label}
          {required && <span className="ml-0.5 text-rust">*</span>}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className={`flex w-full items-center justify-between gap-2 border bg-card py-2.5 pl-3.5 text-left text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-rust disabled:cursor-not-allowed disabled:bg-paper disabled:text-muted/60 ${
            clearable && selected && !disabled ? 'pr-14' : 'pr-3.5'
          } ${error ? 'border-brick' : 'border-ink/30 hover:border-ink/55'}`}
        >
          <span className={selected ? 'text-ink' : 'text-muted'}>
            {selected ? selected.label : placeholder}
          </span>
          <FaChevronDown className={`text-[10px] text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {clearable && selected && !disabled && (
          <button
            type="button"
            aria-label="Clear selection"
            title="Clear selection"
            onClick={() => {
              onChange('')
              setOpen(false)
              setQuery('')
            }}
            className="absolute right-8 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center text-muted transition-colors hover:text-brick"
          >
            <FaTimes className="text-[10px]" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full border border-ink/30 bg-card shadow-[3px_3px_0_0_var(--color-ink)]">
          {searchable && (
            <div className="border-b border-ink/20 p-2">
              <div className="relative">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-muted" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full border border-ink/25 bg-paper py-1.5 pl-8 pr-2 text-sm focus:outline-none focus:ring-1 focus:ring-rust"
                />
              </div>
            </div>
          )}
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3.5 py-2 text-sm text-muted">No options found</div>
            )}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                  setQuery('')
                }}
                className={`flex w-full items-center justify-between px-3.5 py-2 text-left text-sm transition-colors hover:bg-rust/10 ${
                  o.value === value ? 'font-semibold text-rust' : 'text-ink'
                }`}
              >
                {o.label}
                {o.value === value && <FaCheck className="text-[10px]" />}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <p className="mt-1 font-mono text-xs text-brick">{error}</p>}
    </div>
  )
}
