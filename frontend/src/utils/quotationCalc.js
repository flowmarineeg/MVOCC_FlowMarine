// Mirrors quotation.service.js's applyProfitability() for live preview while
// the user is still typing — the server recomputes this authoritatively on
// every save regardless of what's shown here. Profit is computed PER CURRENCY:
// every row carries its own currency and nothing is converted between them.
import { CONTAINER_SIZES, ORIGIN_LINES, DESTINATION_LINES } from '@/constants/quotationRates'

const MIN_MARGIN_PERCENT = 10

// Container size is detected from the ContainerType code's leading digits
// (20DC, 20OT -> 20; 40HC, 40RF, 40OT -> 40); anything else has no size and
// isn't priced by the rate tables.
export function getContainerSize(code) {
  const match = /^(\d{2})/.exec(String(code || '').trim())
  const size = match ? Number(match[1]) : null
  return CONTAINER_SIZES.includes(size) ? size : null
}

// Total quantity of each size across the quotation's selected containers.
export function getQtyBySize(containers = [], containerTypes = []) {
  const codeById = new Map(containerTypes.map((t) => [t._id, t.code]))
  const qtyBySize = { 20: 0, 40: 0 }
  containers.forEach((c) => {
    const size = getContainerSize(codeById.get(c.containerType))
    if (size) qtyBySize[size] += Number(c.quantity) || 0
  })
  return qtyBySize
}

const isBlank = (v) => v === '' || v === undefined || v === null

// Effective quantity of a line for a size: the line's own override when set
// (BL / Telex / Documentation are per B/L or shipment, not per container),
// otherwise the quotation's container count for that size.
export function lineQty(line = {}, size, qtyBySize) {
  const override = line[`qty${size}`]
  return isBlank(override) ? qtyBySize[size] || 0 : Number(override) || 0
}

export function lineSizeTotal(line = {}, size, qtyBySize) {
  return (Number(line[`rate${size}`]) || 0) * lineQty(line, size, qtyBySize)
}

export function lineTotal(line = {}, qtyBySize) {
  return CONTAINER_SIZES.reduce((sum, size) => sum + lineSizeTotal(line, size, qtyBySize), 0)
}

export const lineCurrency = (line) => String(line?.currency ?? '').trim().toUpperCase()

// currency -> amount for one table, skipping removed (hidden) standard lines.
export function tableTotalsByCurrency(table = {}, lines, qtyBySize, acc = new Map()) {
  const hidden = new Set(table.hidden || [])
  const add = (line) => {
    const total = lineTotal(line, qtyBySize)
    if (!total) return
    const cur = lineCurrency(line)
    acc.set(cur, (acc.get(cur) || 0) + total)
  }
  lines.filter(({ key }) => !hidden.has(key)).forEach(({ key }) => add(table[key]))
  ;(table.custom || []).forEach(add)
  return acc
}

export function computeProfitability({ qtyBySize, buying, selling }) {
  const buy = new Map()
  const sell = new Map()
  tableTotalsByCurrency(buying.origin, ORIGIN_LINES, qtyBySize, buy)
  tableTotalsByCurrency(buying.destination, DESTINATION_LINES, qtyBySize, buy)
  tableTotalsByCurrency(selling.origin, ORIGIN_LINES, qtyBySize, sell)
  tableTotalsByCurrency(selling.destination, DESTINATION_LINES, qtyBySize, sell)

  const rows = [...new Set([...buy.keys(), ...sell.keys()])]
    .map((currency) => {
      const b = buy.get(currency) || 0
      const s = sell.get(currency) || 0
      const netProfit = s - b
      const marginPercent = s > 0 ? (netProfit / s) * 100 : 0
      return { currency, buying: b, selling: s, netProfit, marginPercent, belowMinMargin: marginPercent < MIN_MARGIN_PERCENT }
    })
    .sort((x, y) => y.selling - x.selling || y.buying - x.buying || x.currency.localeCompare(y.currency))

  return {
    rows,
    belowMinMargin: rows.length === 0 ? true : rows.some((r) => r.belowMinMargin),
  }
}

export { MIN_MARGIN_PERCENT }
