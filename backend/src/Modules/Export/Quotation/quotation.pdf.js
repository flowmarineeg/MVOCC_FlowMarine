import PDFDocument from 'pdfkit'
import { ORIGIN_LINE_KEYS, DESTINATION_LINE_KEYS } from './quotation.model.js'
import { CONTAINER_SIZES, lineTotal } from './quotation.service.js'

// Client-facing quotation PDF (PRD Step 0 "Send to Client (PDF)").
// It shows the SELLING side only — buying rates, cost, margin and the per-line
// "payable to" data never leave the building.

const LINE_LABELS = {
  oceanFreight: 'Ocean Freight', dgSurcharge: 'DG Surcharge', thc: 'THC', bl: 'BL', telex: 'Telex', documentation: 'Documentation',
  adminFee: 'Admin Fee', dthc: 'DTHC', lolo: 'LOLO', importServiceFee: 'Import Service Fee', deliveryOrder: 'DO',
}

const INK = '#1a1a1a'
const MUTED = '#666666'
const LINE = '#bbbbbb'
const MARGIN = 40

const fmt = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '-')
const portText = (p) => (p ? `${p.code || ''}${p.name ? ` — ${p.name}` : ''}` : '-')

const hasRate = (line, sizes) => !!line && sizes.some((s) => line[`rate${s}`] || line[`qty${s}`])

export const buildQuotationPdf = (q, qtyBySize) => {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, info: { Title: `Quotation ${q.quotationNo}` } })
  const width = doc.page.width - MARGIN * 2
  const sizes = CONTAINER_SIZES.filter((s) => qtyBySize[s] > 0)

  const ensureSpace = (needed) => {
    if (doc.y + needed > doc.page.height - MARGIN - 30) doc.addPage()
  }

  const heading = (text) => {
    ensureSpace(40)
    doc.moveDown(0.8).font('Helvetica-Bold').fontSize(10).fillColor(INK).text(text.toUpperCase())
    doc.moveTo(MARGIN, doc.y + 2).lineTo(MARGIN + width, doc.y + 2).strokeColor(LINE).stroke()
    doc.moveDown(0.5)
  }

  const pair = (label, value) => {
    ensureSpace(16)
    const y = doc.y
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(label, MARGIN, y, { width: 130 })
    doc.font('Helvetica').fontSize(9).fillColor(INK).text(String(value ?? '-') || '-', MARGIN + 135, y, { width: width - 135 })
    doc.y = Math.max(doc.y, y + 13)
  }

  // ── Title block ──
  doc.font('Helvetica-Bold').fontSize(20).fillColor(INK).text('QUOTATION', MARGIN, MARGIN)
  doc.font('Helvetica-Bold').fontSize(11).text(q.quotationNo, MARGIN, MARGIN + 4, { width, align: 'right' })
  doc.font('Helvetica').fontSize(9).fillColor(MUTED)
    .text(`Date: ${fmtDate(q.inquiryDate)}    Valid until: ${fmtDate(q.validityDate)}`, MARGIN, MARGIN + 20, { width, align: 'right' })
  doc.y = MARGIN + 44

  // ── Client ──
  heading('Client')
  pair('Company', q.clientName)
  pair('Contact', q.contactPerson)
  pair('Phone', q.contactPhone)
  pair('Email', q.contactEmail)
  pair('Your reference', q.clientReferenceNo)

  // ── Routing ──
  heading('Routing')
  pair('Port of Loading', portText(q.pol))
  if (q.transshipmentPort) pair('Transshipment', portText(q.transshipmentPort))
  pair('Port of Discharge', portText(q.pod))
  if (q.finalDestination) pair('Final destination', portText(q.finalDestination))
  pair('Incoterm', q.incoterms)
  if (q.targetEtd) pair('Target ETD', fmtDate(q.targetEtd))
  pair('Carrier', q.nvocc?.name)

  // ── Cargo ──
  heading('Equipment & Cargo')
  pair('Equipment', (q.containers || []).map((c) => `${c.quantity} x ${c.containerType?.code || '?'}`).join(',  '))
  pair('Commodity', q.commodity)
  if (q.hsCode) pair('HS code', q.hsCode)
  if (q.grossWeight) pair('Total gross weight', `${fmt(q.grossWeight)} kg`)
  if (q.cbm) pair('Total volume', `${fmt(q.cbm)} CBM`)
  if (q.setTemperature !== undefined && q.setTemperature !== null) {
    pair('Set temperature', `${q.setTemperature} °C${q.ventilationHumidity ? `  (${q.ventilationHumidity})` : ''}`)
  }
  if (q.oogDimensions) pair('Out-of-gauge', q.oogDimensions)
  if (q.isDangerous) {
    pair('Dangerous goods', `UN ${String(q.unNumber || '').replace(/^UN/i, '')} — ${q.properShippingName || ''}`)
    pair('IMO class / PG', `${q.imoClass || '-'} / ${q.packingGroup || '-'}${q.subsidiaryRisk ? `   (subsidiary risk ${q.subsidiaryRisk})` : ''}`)
  }

  // ── Charges (selling) ──
  const nameW = 130
  const curW = 36
  const totalW = 78
  const sizeW = (width - nameW - curW - totalW) / Math.max(sizes.length, 1)

  const chargeTable = (title, table, keys) => {
    const hidden = new Set(table?.hidden || [])
    const lines = [
      ...keys.filter((k) => !hidden.has(k)).map((k) => ({ label: LINE_LABELS[k] || k, line: table?.[k] })),
      ...(table?.custom || []).map((l) => ({ label: l.label, line: l })),
    ].filter(({ line }) => hasRate(line, sizes))
    if (lines.length === 0) return new Map()

    ensureSpace(40 + lines.length * 16)
    doc.moveDown(0.4).font('Helvetica-Bold').fontSize(9).fillColor(INK).text(title)
    let y = doc.y + 3
    doc.rect(MARGIN, y, width, 15).fill('#f0f0f0')
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8)
    doc.text('Charge', MARGIN + 4, y + 4, { width: nameW })
    doc.text('Cur', MARGIN + nameW, y + 4, { width: curW })
    sizes.forEach((s, i) => doc.text(`${s}ft  rate x qty`, MARGIN + nameW + curW + i * sizeW, y + 4, { width: sizeW, align: 'right' }))
    doc.text('Total', MARGIN + width - totalW, y + 4, { width: totalW - 4, align: 'right' })
    y += 17

    const totals = new Map()
    for (const { label, line } of lines) {
      ensureSpace(18)
      if (doc.y > y) y = doc.y
      const currency = String(line.currency || '').toUpperCase()
      const total = lineTotal(line, qtyBySize)
      totals.set(currency, (totals.get(currency) || 0) + total)
      doc.fillColor(INK).font('Helvetica').fontSize(9)
      doc.text(label, MARGIN + 4, y, { width: nameW - 6 })
      doc.text(currency || '-', MARGIN + nameW, y, { width: curW })
      sizes.forEach((s, i) => {
        const qty = line[`qty${s}`] ?? qtyBySize[s]
        const text = line[`rate${s}`] || qty ? `${fmt(line[`rate${s}`])} x ${qty}` : '-'
        doc.text(text, MARGIN + nameW + curW + i * sizeW, y, { width: sizeW, align: 'right' })
      })
      doc.text(fmt(total), MARGIN + width - totalW, y, { width: totalW - 4, align: 'right' })
      y += 15
      doc.moveTo(MARGIN, y - 2).lineTo(MARGIN + width, y - 2).strokeColor('#e4e4e4').stroke()
      doc.y = y
    }
    doc.y = y + 2
    return totals
  }

  heading('Charges')
  const originTotals = chargeTable('Origin charges', q.sellingOrigin, ORIGIN_LINE_KEYS)
  const destinationTotals = chargeTable('Destination charges', q.sellingDestination, DESTINATION_LINE_KEYS)
  const grand = new Map()
  for (const m of [originTotals, destinationTotals]) {
    for (const [cur, amt] of m) grand.set(cur, (grand.get(cur) || 0) + amt)
  }
  if (grand.size === 0) {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('No charges priced yet.')
  } else {
    ensureSpace(20 + grand.size * 14)
    doc.moveDown(0.6).font('Helvetica-Bold').fontSize(10).fillColor(INK)
    for (const [cur, amt] of grand) doc.text(`Total ${cur || ''}: ${fmt(amt)}`, MARGIN, doc.y, { width, align: 'right' })
  }

  // ── Terms ──
  heading('Terms')
  pair('Payment terms', q.paymentTerms)
  if (q.freeTimeBuyingDays !== undefined && q.freeTimeBuyingDays !== null) pair('Free time (demurrage)', `${q.freeTimeBuyingDays} days at destination`)
  if (q.detentionFreeTimeDays !== undefined && q.detentionFreeTimeDays !== null) pair('Free time (detention)', `${q.detentionFreeTimeDays} days`)
  if (q.rateValidFrom || q.rateValidTo) pair('Rate validity', `${fmtDate(q.rateValidFrom)} to ${fmtDate(q.rateValidTo)}`)
  pair('Quotation valid until', fmtDate(q.validityDate))
  if (q.termsRemarks) {
    ensureSpace(40)
    doc.moveDown(0.4).font('Helvetica').fontSize(9).fillColor(INK).text(q.termsRemarks, MARGIN, doc.y, { width })
  }
  pair('Prepared by', q.salesRep)

  return doc
}
