// An identifier chip — used for job numbers and container codes so the most load-bearing
// identifiers stay easy to spot in a table without shouting.
export default function Plate({ children, tone = 'ink', className = '' }) {
  const tones = {
    ink: 'bg-ink/[0.07] text-ink',
    outline: 'border border-line text-ink bg-card',
  }
  return (
    <span
      className={`data-id inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
