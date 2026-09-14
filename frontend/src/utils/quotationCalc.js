// Mirrors quotation.service.js's applyProfitability() for live preview while
// the user is still typing — the server recomputes this authoritatively on
// every save regardless of what's shown here.
const MIN_MARGIN_PERCENT = 10

export function computeProfitability({
  containers = [],
  oceanFreightBuyingByType = {},
  polChargesBuying = {},
  podLocalChargesBuying,
  destinationCharge,
  oceanFreightSellingByType = {},
  polChargesSelling,
  otherFeesToClient = [],
  exchangeRate = 1,
}) {
  const qtyByType = {}
  containers.forEach((c) => {
    if (c.containerType) qtyByType[c.containerType] = (qtyByType[c.containerType] || 0) + (Number(c.quantity) || 0)
  })

  const sumFreight = (byType) =>
    Object.entries(byType).reduce((sum, [typeId, rate]) => sum + (Number(rate) || 0) * (qtyByType[typeId] || 0), 0)

  const totalBuyingCost =
    sumFreight(oceanFreightBuyingByType) +
    (Number(polChargesBuying.thc) || 0) +
    (Number(polChargesBuying.documentation) || 0) +
    (Number(polChargesBuying.seal) || 0) +
    (Number(polChargesBuying.edi) || 0) +
    (Number(podLocalChargesBuying) || 0) +
    (Number(destinationCharge) || 0)

  const otherFees = otherFeesToClient.reduce((sum, f) => sum + (Number(f.amount) || 0), 0)
  const totalSellingPrice = sumFreight(oceanFreightSellingByType) + (Number(polChargesSelling) || 0) + otherFees

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
