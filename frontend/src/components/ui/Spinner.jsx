'use client'

export default function Spinner({ size = 'md', className = '' }) {
  const sizes = { sm: 'w-4 h-4 border-2', md: 'w-8 h-8 border-2', lg: 'w-12 h-12 border-[3px]' }
  return (
    <div className={`${sizes[size]} rounded-full border-ink/15 border-t-rust animate-spin ${className}`} />
  )
}

export function PageLoader() {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center gap-3">
      <Spinner size="lg" />
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Loading manifest…</p>
    </div>
  )
}
