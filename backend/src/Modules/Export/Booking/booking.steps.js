// Sprint 007 — the step engine of the Booking & Job page (docs/ref.md G1 / G4 / G5 / G6).
//
//  * which step each stored field belongs to (the lock map),
//  * the per-step "what is still missing" lists (used by Complete step / Issue HBL),
//  * soft warnings (late flags, variances, stale documents),
//  * the container reconciliation panel (BR-3.5),
//  * the job lifecycle stage (PRD "Job status lifecycle").
//
// Everything here is read-only maths over saved data; the actions that change the
// document (complete / reopen / roll / issue ...) live in booking.service.js.

import Booking from './booking.model.js'
import Quotation from '../Quotation/quotation.model.js'
import Container from '../../MasterData/Container/container.model.js'
import ContainerType from '../../MasterData/ContainerType/containerType.model.js'
import Port from '../../MasterData/Port/port.model.js'

export const STEP_COUNT = 5
export const RECON_TOLERANCE = 0.02 // D16 — PRD default, open question 4
export const VARIANCE_LIMIT = 0.05 // D5 — weight / CBM change vs the quotation that needs a reason
export const SOB_ATD_GAP_DAYS = 3 // S5-19 tenant setting default
export const PARTY_TEXT_MAX_LINES = 5
export const PARTY_TEXT_MAX_CHARS = 35

// ─── Lock map (D4): every field belongs to exactly one step ───────────────────
export const BOOKING_STEP_FIELDS = {
  1: [
    'clientName', 'clientPhone', 'clientEmail', 'pol', 'pod', 'containers', 'commodity', 'hsCode', 'ucrNumber',
    'packagesCount', 'packageType', 'grossWeight', 'netWeight', 'cbm', 'isDangerous', 'dangerousClass', 'unNumber',
    'properShippingName', 'subsidiaryRisk', 'packingGroup', 'flashPoint', 'marinePollutant', 'emergencyContact',
    'setTemperature', 'ventilationHumidity', 'oogDimensions', 'shippingDeclaration', 'cargoReadinessDate',
    'proformaInvoiceNo', 'proformaInvoiceDate', 'acidNumber', 'shipperReference', 'countryOfOrigin',
    'exporterLicenceNo', 'stuffingLocationType', 'stuffingDate', 'specialInstructions', 'weightVarianceReason',
    'shipper', 'consignee', 'notify', 'notifySameAsConsignee', 'shipperParty', 'consigneeParty', 'notifyParty',
    'podAgent', 'podAgentRef', 'polAgent', 'exportTaxNumber', 'importTaxNumber', 'importCountry', 'blNo',
  ],
  2: [
    'carrier', 'vesselName', 'vesselImo', 'voyageNo', 'etd', 'eta', 'spaceConfirmationStatus', 'carrierBookingRef',
    'voContactPerson', 'siCutoff', 'vgmCutoff', 'cyGateInCutoff', 'cyOpeningCutoff', 'customsCutoff', 'dgCutoff',
    'polTerminal', 'podTerminal', 'serviceLoopCode', 'bookingRequestSentAt', 'confirmedEquipment', 'dgAcceptanceRef',
    'voFreeTimeDays', 'bookingConfirmationStatus', 'bookingConfirmationFile', 'nvocc', 'currency', 'price', 'cost', 'freeTime',
  ],
  3: [
    'depot', 'containerAssignments', 'croNumber', 'croIssueDate', 'croValidityDate', 'croIssuedBy', 'releasedTo',
    'truckPlateDriver', 'reconciliationReason', 'gateInDate', 'gateOutDate', 'containerLocation',
  ],
}

export const BL_STEP_FIELDS = {
  4: [
    'exactShipper', 'exactConsignee', 'exactNotify', 'alsoNotify', 'marksAndNumbers', 'exactDescription',
    'finalTotalPackages', 'finalGrossWeight', 'finalCbm', 'finalPackageType', 'placeOfReceipt', 'placeOfDelivery',
    'shippersLoadStowCount', 'lcDetails', 'blRemarks', 'commercialInvoiceNo', 'commercialInvoiceDate',
    'certificateOfOriginNo', 'exportCustomsDeclarationNo', 'customsReleaseDate', 'elHarkaRepName',
    'certificateReceivedDate', 'customsCertificateFile', 'siSubmittedToVoAt', 'voSiReference', 'finalVarianceReason',
    'consigneeToOrder', 'notifyPartyName', 'notifyPartyAddress', 'destinationAgentDetails',
    // approval is part of this step, but it is the one thing that stays writable (see APPROVAL_FIELDS)
  ],
  5: [
    'hblNumber', 'mblNumber', 'blType', 'telexReleaseSentDate', 'numberOfOriginalBLs', 'freightTermsOnBL',
    'freightPayableAt', 'freightPaymentStatus', 'holdOverrideReason', 'freightTermsOverrideReason', 'atd',
    'shippedOnBoardDate', 'sobVarianceReason', 'placeOfIssue', 'dateOfIssue', 'signatoryName', 'signatoryTitle',
    'blReleaseDate', 'courierAwb', 'mblShipper', 'mblConsignee', 'mblNotify', 'mblReleaseType', 'mblFreightTerms',
    'mblIssueDate',
  ],
}

// The approval handshake (S4-50..54) changes while Step 4 is open and is what completes it.
export const APPROVAL_FIELDS = ['clientConfirmationStatus', 'approvedAt', 'approvedBy', 'amendmentNotes', 'draftSentToClientDate', 'blDraftVersion']

// Writable even on a completed step and after the HBL was issued: pure follow-up / status data.
export const ALWAYS_EDITABLE = [
  'jobStatus', 'notes', 'manifestStatus', 'customsSubmitted', 'customsReferenceNo', 'ata', 'customerNotifiedDate',
  'podAgentUpdateLog', 'paymentRequestSent', 'invoiceStatus', 'preAlertSent', 'subManifestNafezaSubmitted',
  'subManifestIssuedSent', 'finalLoadListStatus', 'dgManifestRequired', 'dgManifestStatus', 'reeferManifestRequired',
  'reeferManifestStatus',
]

export const STEP_OF_FIELD = (() => {
  const map = {}
  for (const [step, fields] of Object.entries({ ...BOOKING_STEP_FIELDS, ...BL_STEP_FIELDS })) {
    for (const f of fields) map[f] = Number(step)
  }
  return map
})()

export const isStepComplete = (booking, step) => (booking.stepsCompleted || []).some((s) => s.step === step)
export const isIssued = (booking) => !!booking.hblIssuedAt

// Throws 409 when a save touches a field of a completed step (or anything but follow-up data once the
// HBL is issued). `changedPaths` = booking.modifiedPaths() after the incoming values were applied.
export const assertNotLocked = (booking, changedPaths) => {
  const touched = [...new Set(changedPaths.map((p) => p.split('.')[0]))]
  const locked = []
  for (const field of touched) {
    if (ALWAYS_EDITABLE.includes(field)) continue
    if (APPROVAL_FIELDS.includes(field)) {
      if (isIssued(booking) || isStepComplete(booking, 4)) locked.push({ field, step: 4 })
      continue
    }
    const step = STEP_OF_FIELD[field]
    if (!step) continue
    if (isIssued(booking) || isStepComplete(booking, step)) locked.push({ field, step })
  }
  if (locked.length === 0) return
  const steps = [...new Set(locked.map((l) => l.step))].sort()
  const why = isIssued(booking)
    ? 'The HBL has been issued, so the job is locked — re-issue the HBL (Amend) to change it'
    : `Step ${steps.join(', ')} ${steps.length > 1 ? 'are' : 'is'} complete and locked — Amend ${steps.length > 1 ? 'them' : 'it'} first`
  throw Object.assign(new Error(`${why} (${locked.map((l) => l.field).join(', ')})`), { statusCode: 409 })
}

// ─── Small helpers ────────────────────────────────────────────────────────────
const has = (v) => v !== undefined && v !== null && String(v).trim() !== ''
const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v))
const time = (v) => (v ? new Date(v).getTime() : null)
const dayStr = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '-')
const idOf = (v) => String(v?._id || v || '')
const sum = (arr, pick) => arr.reduce((t, x) => t + (Number(pick(x)) || 0), 0)
const withinTolerance = (expected, actual) => Math.abs(actual - expected) <= expected * RECON_TOLERANCE
const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export const partyTextProblem = (label, text) => {
  if (!has(text)) return null
  const lines = String(text).split(/\r?\n/)
  if (lines.length > PARTY_TEXT_MAX_LINES) return `${label} has more than ${PARTY_TEXT_MAX_LINES} lines`
  if (lines.some((l) => l.length > PARTY_TEXT_MAX_CHARS)) return `${label} has a line longer than ${PARTY_TEXT_MAX_CHARS} characters`
  return null
}

// ─── Context: everything the rules need besides the booking itself ────────────
export const loadContext = async (booking) => {
  const quotationId = idOf(booking.quotation)
  const [quotation, units, pod, types] = await Promise.all([
    quotationId
      ? Quotation.findById(quotationId).select('quotationNo grossWeight cbm commodity paymentTerms targetEtd freeTimeBuyingDays detentionFreeTimeDays msdsFiles._id').lean()
      : null,
    Container.find({ booking: booking._id }).populate('containerType', 'code label maxPayloadKg capacityCbm tareWeightKg').sort({ createdAt: 1 }).lean(),
    booking.pod ? Port.findById(idOf(booking.pod)).select('code name country').lean() : null,
    ContainerType.find({ _id: { $in: (booking.containers || []).map((c) => idOf(c.containerType)) } }).lean(),
  ])
  return { quotation, units, pod, types }
}

const typeById = (ctx, id) => ctx.types.find((t) => String(t._id) === String(id))
const isReefer = (t) => /RF$/i.test(t?.code || '')

// ─── Step 3: reconciliation panel (BR-3.5) ────────────────────────────────────
export const computeReconciliation = (booking, units) => {
  const needed = sum(booking.containers || [], (c) => c.quantity)
  const check = (key, label, expected, actual, unit, tolerant = true) => {
    const skipped = expected === null || expected === undefined || Number.isNaN(Number(expected)) || Number(expected) === 0
    const pass = skipped ? true : tolerant ? withinTolerance(Number(expected), actual) : Number(expected) === actual
    return { key, label, expected: skipped ? null : Number(expected), actual, unit, skipped, pass }
  }
  const checks = [
    { key: 'count', label: 'Container count', expected: needed, actual: units.length, unit: '', skipped: false, pass: units.length === needed },
    check('weight', 'Payload weight', booking.grossWeight, sum(units, (u) => u.payloadWeightKg), 'kg'),
    check('volume', 'Volume', booking.cbm, sum(units, (u) => u.cbm), 'CBM'),
    check('packages', 'Packages', booking.packagesCount, sum(units, (u) => u.packagesInContainer), '', false),
  ]
  return { tolerance: RECON_TOLERANCE, checks, pass: checks.every((c) => c.pass) }
}

// What is wrong / missing on one allocated container (Step 3 grid)
const unitProblems = (u, booking) => {
  const tag = u.containerNumber
  const out = []
  const need = (v, what) => { if (!has(v)) out.push(`${tag}: ${what} is missing`) }
  need(u.sealNumber, 'seal number')
  if (!(Number(u.payloadWeightKg) > 0)) out.push(`${tag}: payload weight is missing`)
  if (!(Number(u.cbm) > 0)) out.push(`${tag}: CBM is missing`)
  if (!(Number(u.packagesInContainer) > 0)) out.push(`${tag}: packages in container is missing`)
  if (!u.vgmMethod) out.push(`${tag}: VGM method is missing`)
  if (!(Number(u.vgmWeightKg) > 0)) out.push(`${tag}: VGM weight is missing`)
  if (u.vgmMethod === 1) need(u.weighbridgeTicket, 'weighbridge ticket (VGM method 1)')
  if (u.vgmMethod === 2 && !(Number(u.packingWeightKg) >= 0 && u.packingWeightKg !== null)) out.push(`${tag}: packing & dunnage weight is missing (VGM method 2)`)
  need(u.vgmDeclaredBy, 'VGM declared by')
  if (!u.vgmSubmittedAt) out.push(`${tag}: VGM submitted time is missing`)
  if (!u.conditionAtGateOut) out.push(`${tag}: condition at gate-out is missing`)
  if (!u.gateOutDate) out.push(`${tag}: gate-out date is missing`)
  if (!u.gateInDate) out.push(`${tag}: gate-in date is missing`)
  const go = time(u.gateOutDate)
  const gi = time(u.gateInDate)
  if (go && booking.croIssueDate && go < time(booking.croIssueDate)) out.push(`${tag}: gate-out is before the CRO issue date`)
  if (go && booking.croValidityDate && go > time(booking.croValidityDate) + 86400000 - 1) out.push(`${tag}: gate-out is after the CRO validity date`)
  if (gi && booking.cyGateInCutoff && gi > time(booking.cyGateInCutoff) && !has(u.lateGateInReason)) out.push(`${tag}: late gate-in (after the CY cut-off) needs a reason`)
  return out
}

// ─── Per-step "what is missing" lists ─────────────────────────────────────────
export const computeStepIssues = (booking, ctx) => {
  const { quotation, units, pod, types } = ctx
  const issues = { 1: [], 2: [], 3: [], 4: [], 5: [] }
  const add = (step, msg) => issues[step].push(msg)
  const need = (step, v, what) => { if (!has(v)) add(step, `${what} is required`) }
  const positive = (step, v, what) => { if (!(Number(v) > 0)) add(step, `${what} is required`) }
  const containers = booking.containers || []
  const qtyTotal = sum(containers, (c) => c.quantity)

  // ── Step 1 — Preliminary S/D ──
  if (containers.length === 0) add(1, 'At least one container type is required')
  if (!booking.cargoReadinessDate) add(1, 'Cargo readiness date is required')
  need(1, booking.proformaInvoiceNo, 'Proforma invoice number')
  if (!booking.proformaInvoiceDate) add(1, 'Proforma invoice date is required')
  const hs = String(booking.hsCode || '').replace(/[.\s]/g, '')
  if (!/^\d{6,10}$/.test(hs)) add(1, 'HS code (6 to 10 digits) is required')
  if (!(Number(booking.packagesCount) >= 1)) add(1, 'Number of packages (1 or more) is required')
  need(1, booking.packageType, 'Package type')
  need(1, booking.commodity, 'Commodity')
  positive(1, booking.grossWeight, 'Gross weight')
  positive(1, booking.netWeight, 'Net weight')
  positive(1, booking.cbm, 'Total CBM')
  if (num(booking.netWeight) !== null && num(booking.grossWeight) !== null && Number(booking.netWeight) > Number(booking.grossWeight)) add(1, 'Net weight cannot exceed gross weight')
  need(1, booking.countryOfOrigin, 'Country of origin')
  need(1, booking.stuffingLocationType, 'Stuffing location type')
  if (booking.stuffingDate && booking.cargoReadinessDate && time(booking.stuffingDate) < time(booking.cargoReadinessDate)) add(1, 'Stuffing date cannot be before the cargo readiness date')
  if (/^egypt$/i.test(pod?.country || '')) {
    if (!/^\d{19}$/.test(String(booking.acidNumber || ''))) add(1, 'ACID number (exactly 19 digits) is required for an Egypt destination')
  }
  if (!has(booking.shipper?.name)) add(1, 'Shipper must be picked')
  if (!has(booking.consignee?.name)) add(1, 'Consignee must be picked')
  if (!has(booking.notify?.name)) add(1, 'Notify party must be picked')
  if (!has(booking.podAgent?.name)) add(1, 'POD agent must be picked (needed for the pre-alert)')
  // capacity of the quoted equipment
  const capped = containers.map((c) => ({ qty: Number(c.quantity), t: typeById(ctx, c.containerType) }))
  if (capped.length && capped.every((c) => c.t?.maxPayloadKg > 0) && Number(booking.grossWeight) > sum(capped, (c) => c.qty * c.t.maxPayloadKg)) {
    add(1, 'Gross weight is above the payload capacity of the container types')
  }
  if (capped.length && capped.every((c) => c.t?.capacityCbm > 0) && Number(booking.cbm) > sum(capped, (c) => c.qty * c.t.capacityCbm)) {
    add(1, 'Total CBM is above the volume capacity of the container types')
  }
  // dangerous goods
  if (booking.isDangerous) {
    need(1, booking.dangerousClass, 'DG class')
    if (!/^(UN)?\d{4}$/i.test(String(booking.unNumber || '').replace(/\s/g, ''))) add(1, 'UN number (4 digits) is required')
    need(1, booking.properShippingName, 'DG proper shipping name')
    need(1, booking.packingGroup, 'DG packing group')
    need(1, booking.emergencyContact, 'DG emergency contact')
    if (quotation && (quotation.msdsFiles || []).length === 0) add(1, 'The quotation has no MSDS attached (required for dangerous goods)')
  }
  if (containers.some((c) => isReefer(typeById(ctx, c.containerType))) && (booking.setTemperature === undefined || booking.setTemperature === null)) {
    add(1, 'Set temperature is required for reefer containers')
  }
  // controlled overrides (G2 / D5)
  if (quotation) {
    const moved = (job, quoted) => num(job) !== null && num(quoted) > 0 && Math.abs(Number(job) - Number(quoted)) / Number(quoted) > VARIANCE_LIMIT
    if ((moved(booking.grossWeight, quotation.grossWeight) || moved(booking.cbm, quotation.cbm)) && !has(booking.weightVarianceReason)) {
      add(1, 'Gross weight / CBM moved more than 5% from the quotation — a reason is required')
    }
  }

  // ── Step 2 — Booking ──
  if (!booking.carrier) add(2, 'Vessel operator (VO) is required')
  need(2, booking.carrierBookingRef, 'VO / master booking reference')
  need(2, booking.vesselName, 'Vessel name')
  need(2, booking.voyageNo, 'Voyage number')
  need(2, booking.polTerminal, 'POL terminal')
  need(2, booking.podTerminal, 'POD terminal (TBA is allowed)')
  if (!booking.etd) add(2, 'ETD is required')
  if (!booking.eta) add(2, 'ETA is required')
  if (booking.etd && booking.eta && time(booking.eta) <= time(booking.etd)) add(2, 'ETA must be after ETD')
  if (booking.etd && booking.cargoReadinessDate && time(booking.etd) < time(booking.cargoReadinessDate)) add(2, 'ETD cannot be before the cargo readiness date')
  for (const [key, label] of [['siCutoff', 'SI cut-off'], ['vgmCutoff', 'VGM cut-off'], ['cyGateInCutoff', 'CY gate-in cut-off']]) {
    if (!booking[key]) add(2, `${label} is required`)
    else if (booking.etd && time(booking[key]) >= time(booking.etd)) add(2, `${label} must be before the ETD`)
  }
  if (booking.cyOpeningCutoff && booking.cyGateInCutoff && time(booking.cyOpeningCutoff) > time(booking.cyGateInCutoff)) add(2, 'CY opening cannot be after the CY gate-in cut-off')
  if (booking.isDangerous) {
    if (!booking.dgCutoff) add(2, 'DG cut-off is required for dangerous goods')
    need(2, booking.dgAcceptanceRef, 'DG acceptance reference')
  }
  if (!booking.bookingConfirmationFile?.fileName) add(2, 'The VO booking confirmation file must be attached')
  if (booking.spaceConfirmationStatus !== 'Confirmed') add(2, 'Booking status must be Confirmed')
  for (const c of containers) {
    const got = sum((booking.confirmedEquipment || []).filter((e) => idOf(e.containerType) === idOf(c.containerType)), (e) => e.quantity)
    if (got < Number(c.quantity)) add(2, `Confirmed equipment for ${typeById(ctx, c.containerType)?.code || 'a container type'} (${got}) does not cover the ${c.quantity} required`)
  }

  // ── Step 3 — Depot / Container ──
  if (booking.status !== 'confirmed') add(3, 'The booking must be confirmed (containers allocated from the depot) first')
  if (!booking.depot) add(3, 'Depot is required')
  need(3, booking.croNumber, 'CRO number')
  if (!booking.croIssueDate) add(3, 'CRO issue date is required')
  if (!booking.croValidityDate) add(3, 'CRO validity date is required')
  if (booking.croIssueDate && booking.croValidityDate && time(booking.croValidityDate) < time(booking.croIssueDate)) add(3, 'CRO validity cannot be before the CRO issue date')
  need(3, booking.croIssuedBy, 'CRO issued by')
  if (units.length !== qtyTotal) add(3, `${units.length} container(s) allocated, ${qtyTotal} required`)
  for (const u of units) for (const p of unitProblems(u, booking)) add(3, p)
  const recon = computeReconciliation(booking, units)
  if (!recon.pass && !has(booking.reconciliationReason)) {
    for (const c of recon.checks.filter((x) => !x.pass)) add(3, `Reconciliation — ${c.label}: ${c.actual} vs ${c.expected}${c.unit ? ` ${c.unit}` : ''} (enter a variance reason or fix the figures)`)
  }

  // ── Step 4 — Final S/D ──
  for (const [key, label] of [['exactShipper', 'Exact shipper'], ['exactConsignee', 'Exact consignee'], ['exactNotify', 'Exact notify']]) {
    if (!has(booking[key])) add(4, `${label} is required`)
    else { const p = partyTextProblem(label, booking[key]); if (p) add(4, p) }
  }
  for (const [key, label] of [['alsoNotify', 'Also notify']]) { const p = partyTextProblem(label, booking[key]); if (p) add(4, p) }
  need(4, booking.marksAndNumbers, 'Marks and numbers (N/M is allowed)')
  need(4, booking.exactDescription, 'Exact commercial description')
  if (!(Number(booking.finalTotalPackages) > 0)) add(4, 'Final total packages is required')
  positive(4, booking.finalGrossWeight, 'Final total gross weight')
  positive(4, booking.finalCbm, 'Final total CBM')
  need(4, booking.finalPackageType, 'Final package type')
  need(4, booking.commercialInvoiceNo, 'Commercial invoice number')
  if (!booking.commercialInvoiceDate) add(4, 'Commercial invoice date is required')
  else if (time(booking.commercialInvoiceDate) > Date.now()) add(4, 'Commercial invoice date cannot be in the future')
  need(4, booking.exportCustomsDeclarationNo, 'Customs declaration number')
  if (!booking.siSubmittedToVoAt) add(4, 'SI submitted to VO (time) is required')
  if ((booking.blDrafts || []).length === 0) add(4, 'Generate the draft B/L and send it to the shipper first')
  if (booking.clientConfirmationStatus !== 'Confirmed') add(4, 'Shipper approval status must be Approved')
  else {
    if (!booking.approvedAt) add(4, 'Approval date is required')
    need(4, booking.approvedBy, 'Approved by')
  }
  if (units.length) {
    const unitPackages = sum(units, (u) => u.packagesInContainer)
    const unitWeight = sum(units, (u) => u.payloadWeightKg)
    const unitCbm = sum(units, (u) => u.cbm)
    const off = []
    if (Number(booking.finalTotalPackages) > 0 && unitPackages > 0 && Number(booking.finalTotalPackages) !== unitPackages) off.push('packages')
    if (Number(booking.finalGrossWeight) > 0 && unitWeight > 0 && !withinTolerance(unitWeight, Number(booking.finalGrossWeight))) off.push('gross weight')
    if (Number(booking.finalCbm) > 0 && unitCbm > 0 && !withinTolerance(unitCbm, Number(booking.finalCbm))) off.push('CBM')
    if (off.length && !has(booking.finalVarianceReason)) add(4, `Final ${off.join(', ')} differ from the container totals — a variance reason is required`)
  }

  // ── Step 5 — issuance (what Issue HBL needs) ──
  if (!booking.blType) add(5, 'B/L release type is required')
  if (booking.blType === 'Original 3/3' && !(Number(booking.numberOfOriginalBLs) >= 1 && Number(booking.numberOfOriginalBLs) <= 3)) add(5, 'Number of originals (1 to 3) is required for an Original B/L')
  need(5, booking.freightTermsOnBL, 'Freight terms')
  if (quotation?.paymentTerms && booking.freightTermsOnBL && booking.freightTermsOnBL !== quotation.paymentTerms && !has(booking.freightTermsOverrideReason)) {
    add(5, `Freight terms differ from the quotation's payment term (${quotation.paymentTerms}) — an override reason is required`)
  }
  need(5, booking.freightPayableAt, 'Freight payable at')
  if (!booking.atd) add(5, 'Actual time of departure (ATD) is required')
  if (!booking.shippedOnBoardDate) add(5, 'Shipped on board date is required')
  else {
    if (time(booking.shippedOnBoardDate) > Date.now()) add(5, 'Shipped on board date cannot be in the future')
    const lastGateIn = Math.max(0, ...units.map((u) => time(u.gateInDate) || 0))
    if (lastGateIn && time(booking.shippedOnBoardDate) < new Date(dayStr(new Date(lastGateIn))).getTime()) add(5, 'Shipped on board date cannot be before the latest gate-in')
    if (booking.atd && Math.abs(time(booking.shippedOnBoardDate) - time(booking.atd)) > SOB_ATD_GAP_DAYS * 86400000 && !has(booking.sobVarianceReason)) {
      add(5, `Shipped on board is more than ${SOB_ATD_GAP_DAYS} days from the ATD — a reason is required`)
    }
  }
  need(5, booking.placeOfIssue, 'Place of issue')
  if (!booking.dateOfIssue) add(5, 'Date of issue is required')
  else if (booking.shippedOnBoardDate && time(booking.dateOfIssue) < time(booking.shippedOnBoardDate)) add(5, 'Date of issue cannot be before the shipped on board date')
  need(5, booking.signatoryName, 'Signatory name')
  need(5, booking.signatoryTitle, 'Signatory title')
  if (releaseHold(booking) && ['Original 3/3', 'Telex Release', 'Express Release'].includes(booking.blType) && !has(booking.holdOverrideReason)) {
    add(5, 'Release hold: freight is Prepaid and Unpaid — a Finance override reason is required to release')
  }
  return issues
}

// Prepaid + Unpaid blocks release (S5-17, BR-5.2)
export const releaseHold = (booking) => booking.freightTermsOnBL === 'Freight Prepaid' && booking.freightPaymentStatus === 'Unpaid'

// ─── Soft warnings (never block a save) ──────────────────────────────────────
export const computeWarnings = async (booking, ctx) => {
  const { quotation, units } = ctx
  const out = []
  const warn = (step, message) => out.push({ step, message })
  if (booking.cargoReadinessDate && quotation?.targetEtd && time(booking.cargoReadinessDate) > time(quotation.targetEtd)) warn(1, 'Cargo readiness is later than the quotation\'s target ETD')
  if (booking.cargoReadinessDate && time(booking.cargoReadinessDate) < startOfToday() && !isStepComplete(booking, 1)) warn(1, 'Cargo readiness date is in the past')
  if (booking.proformaInvoiceDate && time(booking.proformaInvoiceDate) > Date.now()) warn(1, 'Proforma invoice date is in the future')
  if (quotation && booking.commodity && quotation.commodity && booking.commodity.trim() !== quotation.commodity.trim()) warn(1, 'Commodity differs from the quotation')
  if (booking.cyGateInCutoff && booking.cargoReadinessDate && time(booking.cyGateInCutoff) < time(booking.cargoReadinessDate)) warn(2, 'The CY cut-off is before the cargo readiness date')
  if (booking.carrierBookingRef && booking.carrier) {
    const dup = await Booking.countDocuments({ _id: { $ne: booking._id }, carrier: booking.carrier, carrierBookingRef: booking.carrierBookingRef })
    if (dup > 0) warn(2, `VO booking reference ${booking.carrierBookingRef} is already used on ${dup} other job(s) of this VO`)
  }
  if (quotation?.freeTimeBuyingDays != null && booking.voFreeTimeDays != null && Number(quotation.freeTimeBuyingDays) > Number(booking.voFreeTimeDays)) {
    warn(2, `The client was promised ${quotation.freeTimeBuyingDays} free days but the VO gives ${booking.voFreeTimeDays}`)
  }
  for (const u of units) {
    if (u.vgmSubmittedAt && booking.vgmCutoff && time(u.vgmSubmittedAt) > time(booking.vgmCutoff)) warn(3, `${u.containerNumber}: VGM was submitted after the VGM cut-off`)
    if (u.gateInDate && booking.cyGateInCutoff && time(u.gateInDate) > time(booking.cyGateInCutoff)) warn(3, `${u.containerNumber}: late gate-in (after the CY cut-off)`)
  }
  if (booking.siSubmittedToVoAt && booking.siCutoff && time(booking.siSubmittedToVoAt) > time(booking.siCutoff)) warn(4, 'The shipping instruction was submitted after the SI cut-off')
  const lastDraft = (booking.blDrafts || []).slice(-1)[0]
  if (lastDraft && booking.siCutoff && time(lastDraft.sentAt) > time(booking.siCutoff)) warn(4, 'The draft B/L was sent after the SI cut-off')
  // documents changed after they were sent to the terminal (BR-5.4)
  const lastLoading = (booking.documents || []).filter((d) => d.kind === 'loading-list').slice(-1)[0]
  if (lastLoading && booking.updatedAt && time(booking.updatedAt) > time(lastLoading.at) + 1000) warn(5, 'The loading list was generated before the latest changes — re-send it to the terminal')
  return out
}

// ─── Lifecycle stage (PRD "Job status lifecycle") ────────────────────────────
export const computeLifecycle = (booking, units) => {
  let stage = booking.quotation ? 'Accepted' : 'Job opened'
  if (isStepComplete(booking, 1)) stage = 'S/D Prelim Complete'
  if (isStepComplete(booking, 2)) stage = 'Booked'
  if (isStepComplete(booking, 3) || (booking.status === 'confirmed' && has(booking.croNumber))) stage = 'Equipment Released'
  if (units.length > 0 && units.every((u) => u.gateInDate)) stage = 'Gated In'
  if (isStepComplete(booking, 4)) stage = 'Final S/D Approved'
  if (booking.atd) stage = 'Sailed'
  if (isIssued(booking)) stage = 'BL Issued'
  if ((booking.preAlerts || []).length > 0) stage = 'Pre-alerted'
  if (booking.jobStatus === 'closed_invoiced') stage = 'Closed'
  const exception = booking.status === 'cancelled' ? 'Cancelled' : booking.spaceConfirmationStatus === 'Rolled' ? 'Rolled' : null
  return { stage, exception }
}

// ─── One call for the controllers ────────────────────────────────────────────
export const buildJobState = async (bookingId) => {
  const booking = await Booking.findById(bookingId)
  if (!booking) return null
  const ctx = await loadContext(booking)
  return {
    stepIssues: computeStepIssues(booking, ctx),
    warnings: await computeWarnings(booking, ctx),
    reconciliation: computeReconciliation(booking, ctx.units),
    lifecycle: computeLifecycle(booking, ctx.units),
    stepsCompleted: (booking.stepsCompleted || []).map((s) => s.step),
    reconfirmSteps: booking.reconfirmSteps || [],
    hblIssued: isIssued(booking),
    // what the Final S/D and HBL blocks echo from Step 3 (S4-05) — safe for the documentation role
    unitSummary: ctx.units.map((u) => ({
      containerNumber: u.containerNumber, type: u.containerType?.code, sealNumber: u.sealNumber, packages: u.packagesInContainer,
      payloadKg: u.payloadWeightKg, cbm: u.cbm, vgmKg: u.vgmWeightKg, gateInDate: u.gateInDate,
    })),
  }
}

// Used by the unit editor: hard-stops for impossible container data + soft warnings.
export const checkUnit = (unit, type, booking) => {
  const errors = []
  const warnings = []
  const payload = num(unit.payloadWeightKg)
  const cbm = num(unit.cbm)
  if (payload !== null && type?.maxPayloadKg > 0 && payload > type.maxPayloadKg) errors.push(`Payload ${payload} kg is above the ${type.maxPayloadKg} kg maximum of ${type.code}`)
  if (cbm !== null && type?.capacityCbm > 0 && cbm > type.capacityCbm) errors.push(`${cbm} CBM is above the ${type.capacityCbm} CBM capacity of ${type.code}`)
  const tare = type?.tareWeightKg > 0 ? type.tareWeightKg : null
  if (unit.vgmMethod === 1 && tare !== null && payload !== null && num(unit.vgmWeightKg) !== null && Number(unit.vgmWeightKg) < tare + payload) {
    errors.push(`VGM ${unit.vgmWeightKg} kg is below tare + payload (${tare + payload} kg)`)
  }
  if (unit.gateOutDate && unit.gateInDate && time(unit.gateInDate) < time(unit.gateOutDate)) errors.push('Gate-in cannot be before gate-out')
  if (unit.vgmSubmittedAt && booking?.vgmCutoff && time(unit.vgmSubmittedAt) > time(booking.vgmCutoff)) warnings.push('VGM submitted after the VGM cut-off (late)')
  if (unit.gateInDate && booking?.cyGateInCutoff && time(unit.gateInDate) > time(booking.cyGateInCutoff)) warnings.push('Gate-in after the CY cut-off (late) — a reason is needed')
  if (unit.gateOutDate && booking?.croIssueDate && time(unit.gateOutDate) < time(booking.croIssueDate)) warnings.push('Gate-out is before the CRO issue date')
  if (unit.gateOutDate && booking?.croValidityDate && time(unit.gateOutDate) > time(booking.croValidityDate) + 86400000 - 1) warnings.push('Gate-out is after the CRO validity date')
  return { errors, warnings }
}

// Method 2 VGM is calculated (tare + payload + packing); returns null when it cannot be.
export const calculatedVgm = (unit, type) => {
  const tare = type?.tareWeightKg > 0 ? type.tareWeightKg : null
  if (unit.vgmMethod !== 2 || tare === null || num(unit.payloadWeightKg) === null) return null
  return tare + Number(unit.payloadWeightKg) + (num(unit.packingWeightKg) || 0)
}
