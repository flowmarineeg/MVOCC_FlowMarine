// Sprint 007 — the documents of Step 5 (docs/ref.md section 10, Actions).
//   * Terminal Loading List  -> Excel (exceljs)
//   * DG Manifest            -> PDF   (pdfkit)
//   * Draft / final HBL      -> PDF   (pdfkit)
// They read the whole job on the server, but print only what belongs on the document —
// never price, cost or margin, and the VO name stays off the HBL (PRD S5-01).

import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'

const INK = '#1a1a1a'
const MUTED = '#666666'
const LINE = '#bbbbbb'
const MARGIN = 36

const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '')
const fmtDateTime = (d) => (d ? new Date(d).toISOString().replace('T', ' ').slice(0, 16) : '')
const fmt = (n, digits = 2) => (n === undefined || n === null || n === '' ? '' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits }))
const portText = (p) => (p ? `${p.name || ''}${p.code ? ` (${p.code})` : ''}` : '')

// Carrier signing wording is still an open business question (PRD conflict C2) — one constant to change.
export const signingCapacity = (booking) =>
  `Signed for the Carrier ${booking.nvocc?.name || '—'} by ${booking.signatoryName || '—'}${booking.signatoryTitle ? `, ${booking.signatoryTitle}` : ''} as agent`

// ─── Terminal Loading List (Excel) ───────────────────────────────────────────
export const buildLoadingListWorkbook = (booking, units) => {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'NVOCC System'
  wb.created = new Date()
  const sheet = wb.addWorksheet('Loading List')

  sheet.addRow(['TERMINAL LOADING LIST']).font = { bold: true, size: 14 }
  sheet.addRow([`Job: ${booking.jobNo}`, `Vessel: ${booking.vesselName || ''}`, `Voyage: ${booking.voyageNo || ''}`, `VO booking ref: ${booking.carrierBookingRef || ''}`])
  sheet.addRow([`POL: ${portText(booking.pol)}`, `POD: ${portText(booking.pod)}`, `ETD: ${fmtDateTime(booking.etd)}`, `Booking type: ${booking.bookingType || 'SOC'}`])
  sheet.addRow([])

  const columns = [
    { header: 'Container No', key: 'no', width: 16 },
    { header: 'Type', key: 'type', width: 8 },
    { header: 'Seal', key: 'seal', width: 14 },
    { header: 'Customs seal', key: 'cseal', width: 14 },
    { header: 'Gross weight kg', key: 'gross', width: 16 },
    { header: 'VGM kg', key: 'vgm', width: 12 },
    { header: 'Packages', key: 'pk', width: 10 },
    { header: 'POD', key: 'pod', width: 10 },
    { header: 'DG class', key: 'dgc', width: 10 },
    { header: 'UN no', key: 'un', width: 10 },
    { header: 'Set temp °C', key: 'temp', width: 12 },
    { header: 'SOC', key: 'soc', width: 6 },
    { header: 'Gate-in', key: 'gi', width: 16 },
  ]
  const headerRow = sheet.addRow(columns.map((c) => c.header))
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } } })
  columns.forEach((c, i) => { sheet.getColumn(i + 1).width = c.width })

  for (const u of units) {
    const tare = u.containerType?.tareWeightKg || 0
    sheet.addRow([
      u.containerNumber,
      u.containerType?.code || '',
      u.sealNumber || '',
      u.customsSealNo || '',
      u.payloadWeightKg !== null && u.payloadWeightKg !== undefined ? Number(u.payloadWeightKg) + tare : '',
      u.vgmWeightKg ?? '',
      u.packagesInContainer ?? '',
      booking.pod?.code || '',
      booking.isDangerous ? booking.dangerousClass || '' : '',
      booking.isDangerous ? booking.unNumber || '' : '',
      booking.setTemperature ?? '',
      'Y',
      fmtDateTime(u.gateInDate),
    ])
  }
  return wb
}

// ─── shared PDF helpers ─────────────────────────────────────────────────────
const newDoc = (title, layout = 'portrait') => new PDFDocument({ size: 'A4', layout, margin: MARGIN, info: { Title: title } })

const box = (doc, x, y, w, h, label, text, opts = {}) => {
  doc.rect(x, y, w, h).strokeColor(LINE).stroke()
  doc.font('Helvetica').fontSize(6.5).fillColor(MUTED).text(label.toUpperCase(), x + 4, y + 3, { width: w - 8 })
  doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size || 8.5).fillColor(INK)
    .text(String(text ?? ''), x + 4, y + 13, { width: w - 8, height: h - 16 })
}

// ─── DG Manifest (PDF) ──────────────────────────────────────────────────────
export const buildDgManifestPdf = (booking, units) => {
  const doc = newDoc(`DG manifest ${booking.jobNo}`, 'landscape')
  const width = doc.page.width - MARGIN * 2
  doc.font('Helvetica-Bold').fontSize(16).fillColor(INK).text('DANGEROUS GOODS MANIFEST', MARGIN, MARGIN)
  doc.font('Helvetica').fontSize(9).fillColor(MUTED)
    .text(`Job ${booking.jobNo}   |   Vessel ${booking.vesselName || '-'} / ${booking.voyageNo || '-'}   |   ${portText(booking.pol)} → ${portText(booking.pod)}   |   ETD ${fmtDate(booking.etd)}`, MARGIN, MARGIN + 22, { width })

  const rows = [
    ['UN number', booking.unNumber], ['Proper shipping name', booking.properShippingName], ['IMO class', booking.dangerousClass],
    ['Subsidiary risk', booking.subsidiaryRisk], ['Packing group', booking.packingGroup],
    ['Flash point', booking.flashPoint !== undefined && booking.flashPoint !== null ? `${booking.flashPoint} °C` : ''],
    ['Marine pollutant', booking.marinePollutant ? 'YES' : 'No'], ['Emergency contact', booking.emergencyContact],
  ]
  let y = MARGIN + 48
  const colW = width / 4
  rows.forEach(([label, value], i) => {
    box(doc, MARGIN + (i % 4) * colW, y + Math.floor(i / 4) * 38, colW, 36, label, value || '-', { bold: true, size: 10 })
  })
  y += 90

  const cols = [
    ['Container No', 90], ['Type', 40], ['Seal', 80], ['Packages', 60], ['Net weight kg', 80], ['Gross weight kg', 90],
  ]
  doc.rect(MARGIN, y, width, 16).fill('#eeeeee')
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8)
  let x = MARGIN + 4
  cols.forEach(([h, w]) => { doc.text(h, x, y + 4, { width: w }); x += w })
  y += 20
  doc.font('Helvetica').fontSize(9).fillColor(INK)
  const perUnitNet = units.length ? Number(booking.netWeight || 0) / units.length : 0
  for (const u of units) {
    x = MARGIN + 4
    const gross = u.payloadWeightKg !== null && u.payloadWeightKg !== undefined ? u.payloadWeightKg : ''
    const vals = [u.containerNumber, u.containerType?.code || '', u.sealNumber || '', u.packagesInContainer ?? '', fmt(perUnitNet), fmt(gross)]
    cols.forEach(([, w], i) => { doc.text(String(vals[i]), x, y, { width: w - 4 }); x += w })
    y += 15
    if (y > doc.page.height - MARGIN - 40) { doc.addPage(); y = MARGIN }
  }
  doc.font('Helvetica').fontSize(8).fillColor(MUTED)
    .text('Net weight per container is the declared job net weight split evenly across the containers.', MARGIN, y + 8, { width })
  return doc
}

// ─── Draft / final HBL (PDF) ────────────────────────────────────────────────
export const buildHblPdf = (booking, units, { draft = false } = {}) => {
  const doc = newDoc(`${draft ? 'Draft ' : ''}HBL ${booking.hblNumber || booking.jobNo}`)
  const W = doc.page.width - MARGIN * 2
  const half = W / 2

  doc.font('Helvetica-Bold').fontSize(16).fillColor(INK).text('HOUSE BILL OF LADING', MARGIN, MARGIN, { width: W, align: 'center' })
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(
    draft ? `DRAFT — version ${(booking.blDrafts || []).slice(-1)[0]?.version || 1} — not a negotiable document`
      : booking.hblVersion > 1 ? `Replaces HBL ${booking.hblNumber} (version ${booking.hblVersion - 1})` : 'Original', MARGIN, MARGIN + 20, { width: W, align: 'center' })

  const exactOr = (exact, snap) => exact || [snap?.name, snap?.address, snap?.country].filter(Boolean).join('\n')
  const consignee = booking.consigneeToOrder ? 'TO ORDER' : exactOr(booking.exactConsignee, booking.consignee)
  const y0 = MARGIN + 40
  box(doc, MARGIN, y0, half, 70, 'Shipper', exactOr(booking.exactShipper, booking.shipper))
  box(doc, MARGIN + half, y0, half, 35, 'HBL number', booking.hblNumber || (draft ? '(assigned on issue)' : ''), { bold: true, size: 11 })
  box(doc, MARGIN + half, y0 + 35, half, 35, 'Job / booking ref', `${booking.jobNo}   ${booking.carrierBookingRef ? `· ${booking.carrierBookingRef}` : ''}`)
  box(doc, MARGIN, y0 + 70, half, 70, 'Consignee', consignee)
  box(doc, MARGIN + half, y0 + 70, half, 70, 'Notify party', exactOr(booking.exactNotify, booking.notify) + (booking.alsoNotify ? `\nAlso notify: ${booking.alsoNotify}` : ''))
  const q = W / 4
  box(doc, MARGIN, y0 + 140, q, 34, 'Vessel / voyage', `${booking.vesselName || ''} ${booking.voyageNo || ''}`)
  box(doc, MARGIN + q, y0 + 140, q, 34, 'Port of loading', portText(booking.pol))
  box(doc, MARGIN + 2 * q, y0 + 140, q, 34, 'Port of discharge', portText(booking.pod))
  box(doc, MARGIN + 3 * q, y0 + 140, q, 34, 'Place of delivery', booking.placeOfDelivery || '')
  box(doc, MARGIN, y0 + 174, q, 34, 'Place of receipt', booking.placeOfReceipt || '')
  box(doc, MARGIN + q, y0 + 174, q, 34, 'Freight', `${booking.freightTermsOnBL || ''}${booking.freightPayableAt ? ` · payable at ${booking.freightPayableAt}` : ''}`)
  box(doc, MARGIN + 2 * q, y0 + 174, q, 34, 'Shipped on board', fmtDate(booking.shippedOnBoardDate))
  box(doc, MARGIN + 3 * q, y0 + 174, q, 34, 'B/L type', booking.blType === 'Original 3/3' && booking.numberOfOriginalBLs ? `Original (${booking.numberOfOriginalBLs}/${booking.numberOfOriginalBLs})` : booking.blType || '')

  // particulars
  const py = y0 + 218
  box(doc, MARGIN, py, 110, 150, 'Marks & numbers', booking.marksAndNumbers || 'N/M')
  const cargoLines = [
    `${fmt(booking.finalTotalPackages ?? booking.packagesCount)} ${booking.finalPackageType || booking.packageType || 'packages'}`,
    booking.exactDescription || booking.commodity || '',
    booking.hsCode ? `HS code: ${booking.hsCode}` : '',
    booking.isDangerous ? `DANGEROUS GOODS — UN ${String(booking.unNumber || '').replace(/^UN/i, '')}, class ${booking.dangerousClass || ''}${booking.properShippingName ? `, ${booking.properShippingName}` : ''}` : '',
    '',
    ...units.map((u) => `${u.containerNumber} / ${u.containerType?.code || ''} / seal ${u.sealNumber || '-'}${u.packagesInContainer ? ` / ${u.packagesInContainer} pkgs` : ''}`),
    '',
    'SOC — shipper-owned containers.',
    booking.shippersLoadStowCount !== false ? "SHIPPER'S LOAD, STOW AND COUNT" : '',
  ].filter((l, i, arr) => l !== '' || arr[i - 1] !== '')
  box(doc, MARGIN + 110, py, W - 110 - 180, 150, 'Description of packages and goods', cargoLines.join('\n'), { size: 8 })
  box(doc, MARGIN + W - 180, py, 90, 150, 'Gross weight', `${fmt(booking.finalGrossWeight ?? booking.grossWeight)} kg`, { bold: true })
  box(doc, MARGIN + W - 90, py, 90, 150, 'Measurement', `${fmt(booking.finalCbm ?? booking.cbm)} CBM`, { bold: true })

  const ry = py + 150
  if (booking.lcDetails || booking.blRemarks) {
    box(doc, MARGIN, ry, W, 56, 'Letter of credit / remarks', [booking.lcDetails && `L/C: ${booking.lcDetails}`, booking.blRemarks].filter(Boolean).join('\n'))
  }
  const sy = ry + (booking.lcDetails || booking.blRemarks ? 56 : 0)
  box(doc, MARGIN, sy, W * 0.4, 70, 'Place and date of issue', `${booking.placeOfIssue || ''}\n${fmtDate(booking.dateOfIssue)}`)
  box(doc, MARGIN + W * 0.4, sy, W * 0.6, 70, 'Signature', `${signingCapacity(booking)}\n\n(wording subject to business confirmation)`)

  if (draft) {
    doc.save()
    doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] })
    doc.font('Helvetica-Bold').fontSize(96).fillColor('#cc0000').opacity(0.12)
      .text('DRAFT', 0, doc.page.height / 2 - 60, { width: doc.page.width, align: 'center' })
    doc.restore()
  }
  return doc
}
