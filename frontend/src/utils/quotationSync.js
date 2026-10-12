// Buying -> Selling mirroring for the Quotation rate tables. Editing a Buying
// table copies that change (a value, a currency, a label, a new row, a
// restored standard row) onto the matching Selling table; the Selling tables
// never write back to Buying.
//
// `mirrorRemovals` is for a Selling table the user can't edit by hand (the
// Destination table is view-only): there, removing a row on Buying must also
// remove it from Selling, or a charge nobody can delete would stay priced in.
const LINE_FIELDS = ['rate20', 'rate40', 'qty20', 'qty40', 'currency']

export const newUid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

const differs = (a, b) => (a ?? '') !== (b ?? '')

export function mirrorBuyingToSelling(prevBuying, nextBuying, selling, lines, { mirrorRemovals = false } = {}) {
  let out = { ...selling }
  let hidden = [...(selling.hidden || [])]

  // Standard (fixed) lines: copy only the fields that actually changed, so a
  // later edit to one cell never clobbers a different cell the user already
  // adjusted on the Selling side.
  lines.forEach(({ key }) => {
    const before = prevBuying[key] || {}
    const after = nextBuying[key] || {}
    const changed = LINE_FIELDS.filter((f) => differs(before[f], after[f]))
    if (changed.length === 0) return
    out[key] = { ...out[key], ...Object.fromEntries(changed.map((f) => [f, after[f] ?? ''])) }
    hidden = hidden.filter((k) => k !== key) // a value landed here — make sure the row is visible
  })

  // A standard line restored on the Buying side comes back on Selling too.
  const stillHiddenOnBuying = new Set(nextBuying.hidden || [])
  ;(prevBuying.hidden || []).filter((k) => !stillHiddenOnBuying.has(k)).forEach((k) => {
    hidden = hidden.filter((h) => h !== k)
  })

  // Custom rows are linked by uid: new rows are appended, edited ones updated.
  const before = new Map((prevBuying.custom || []).map((l) => [l.uid, l]))
  const custom = [...(out.custom || [])]
  ;(nextBuying.custom || []).forEach((line) => {
    const old = before.get(line.uid)
    if (!old) {
      if (!custom.some((l) => l.uid === line.uid)) custom.push({ ...line })
      return
    }
    const changed = ['label', ...LINE_FIELDS].filter((f) => differs(old[f], line[f]))
    if (changed.length === 0) return
    const idx = custom.findIndex((l) => l.uid === line.uid)
    if (idx >= 0) custom[idx] = { ...custom[idx], ...Object.fromEntries(changed.map((f) => [f, line[f] ?? ''])) }
  })

  if (mirrorRemovals) {
    // Standard line newly hidden on Buying: hide it on Selling and drop its values.
    const prevHidden = new Set(prevBuying.hidden || [])
    ;(nextBuying.hidden || []).filter((k) => !prevHidden.has(k)).forEach((k) => {
      if (!hidden.includes(k)) hidden.push(k)
      const cur = out[k] || {}
      out[k] = { rate20: '', rate40: '', qty20: '', qty40: '', currency: cur.currency ?? '' }
    })
    // Custom row deleted on Buying: delete it on Selling.
    const stillThere = new Set((nextBuying.custom || []).map((l) => l.uid))
    const removed = new Set((prevBuying.custom || []).filter((l) => !stillThere.has(l.uid)).map((l) => l.uid))
    return { ...out, hidden, custom: custom.filter((l) => !removed.has(l.uid)) }
  }

  return { ...out, hidden, custom }
}
