// A container ID plate — used for job numbers and container codes so the
// most load-bearing identifiers in the app read like the stenciled plates
// bolted to a real shipping container, not plain table text.
export default function Plate({ children, tone = 'ink', className = '' }) {
  const tones = {
    ink: 'bg-ink text-paper',
    outline: 'border border-ink/25 text-ink bg-transparent',
  }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 font-mono text-xs font-semibold tracking-[0.06em] ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
