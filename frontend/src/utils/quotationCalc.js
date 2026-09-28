// Mirrors quotation.service.js's applyProfitability() for live preview while
// the user is still typing — the server recomputes this authoritatively on
// every save regardless of what's shown here.
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

export function tableTotal(table = {}, lines, qtyBySize) {
  const fixed = lines.reduce((sum, { key }) => sum + lineTotal(table[key], qtyBySize), 0)
  const custom = (table.custom || []).reduce((sum, line) => sum + lineTotal(line, qtyBySize), 0)
  return fixed + custom
}

// Destination has its own currency; it's converted into the side's base
// (Origin) currency only when the two differ.
export function sideTotal({ origin, destination, currency, destinationCurrency, destinationRate }, qtyBySize) {
  const rate = destinationCurrency && destinationCurrency !== currency ? Number(destinationRate) || 1 : 1
  return tableTotal(origin, ORIGIN_LINES, qtyBySize) + tableTotal(destination, DESTINATION_LINES, qtyBySize) * rate
}

export function computeProfitability({ qtyBySize, buying, selling, exchangeRate = 1 }) {
  const totalBuyingCost = sideTotal(buying, qtyBySize)
  const totalSellingPrice = sideTotal(selling, qtyBySize)

  const rate = Number(exchangeRate) || 1
  const netProfit = totalSellingPrice - totalBuyingCost * rate
  const profitMarginPercent = totalSellingPrice > 0 ? (netProfit / totalSellingPrice) * 100 : 0

  return {
    totalBuyingCost,
    totalSellingPrice,
    netProfit,
    profitMarginPercent,
    belowMinMargin: profitMarginPercent < MIN_MARGIN_PERCENT,
  }
}

export { MIN_MARGIN_PERCENT }
