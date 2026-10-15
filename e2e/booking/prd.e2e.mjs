// Sprint 007 — Booking & Job vs the Export PRD (docs/ref.md Steps 1-5), API level.
// Drives the real HTTP API (default :5000). Run: cd e2e && npm run booking:prd
// Creates E2E-BOOKING-PRD-* data (a temp Egypt port, a temp container type with capacity numbers,
// stock units, jobs, two temp roles+users) and deletes everything when done.
import { pathToFileURL, fileURLToPath } from 'node:url'

const BACKEND = fileURLToPath(new URL('../../backend/', import.meta.url))
const imp = (p) => import(pathToFileURL(BACKEND + p).href)
const { default: dotenv } = await imp('node_modules/dotenv/lib/main.js')
dotenv.config({ path: BACKEND + '.env' })
const { default: mongoose } = await imp('node_modules/mongoose/index.js')
const { hashPassword } = await imp('src/utils/password.util.js')

const API = process.env.API || 'http://localhost:5000/api'
const RUN = `E2E-BOOKING-PRD-${Date.now().toString(36).toUpperCase()}`
const results = []
const created = { bookingIds: [], jobNos: [], hblNumbers: [], roleIds: [], userIds: [], portIds: [], typeIds: [], voIds: [], nvoccIds: [], vesselIds: [] }

const check = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + detail}`)
}
const msg = (r) => JSON.stringify(r.json?.message || r.json?.errors?.map((e) => e.msg) || r.json)

function session() {
  let cookie = ''
  return async (method, path, body, { form = false, noAuth = false, raw = false } = {}) => {
    const headers = {}
    if (cookie && !noAuth) headers.cookie = cookie
    let payload
    if (form) payload = body
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body) }
    const res = await fetch(API + path, { method, headers, body: payload })
    const sc = res.headers.getSetCookie?.() || []
    if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ')
    let json = null
    let bytes = null
    if (raw) bytes = Buffer.from(await res.arrayBuffer())
    else { try { json = await res.json() } catch { /* empty */ } }
    return { status: res.status, json, bytes, headers: res.headers }
  }
}
const admin = session()
const PNG_BYTES = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
const day = (n) => new Date(Date.now() + n * 86400000).toISOString()

let db
try {
  let r = await admin('POST', '/auth/login', { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_DEFAULT_PASSWORD }, { noAuth: true })
  if (r.status !== 200) r = await admin('POST', '/auth/login', { email: 'admin@nvocc.local', password: 'ChangeMe123!' }, { noAuth: true })
  check('admin login', r.status === 200, msg(r))
  if (r.status !== 200) throw new Error('cannot log in — aborting')

  const list = async (p) => (await admin('GET', p)).json?.data || []
  const ports = await list('/master/ports')
  const nvoccs = await list('/master/nvoccs')
  const depots = await list('/master/depots')
  const depot = depots[0]
  check('master data available (a port, an NVOCC, a Depot)', ports.length >= 1 && nvoccs.length >= 1 && depot, `ports=${ports.length}`)
  // a temp carrier with its own HBL number series
  r = await admin('POST', '/master/nvoccs', { name: `${RUN} Carrier`, code: 'E2EN', hblPrefix: 'e2e' })
  check('temp carrier with an HBL prefix created (prefix is upper-cased)', r.status === 201 && r.json.data.hblPrefix === 'E2E', msg(r))
  const nvocc = r.json?.data
  created.nvoccIds.push(nvocc._id)
  r = await admin('POST', '/master/vessel-operators', { name: `${RUN} VO`, code: 'E2VO' })
  check('temp vessel operator created', r.status === 201, msg(r))
  const vo = r.json?.data
  created.voIds.push(vo._id)
  r = await admin('POST', '/master/vessels', { vesselOperator: vo._id, name: 'MV IMO TEST', imoNumber: '9123456' })
  check('a vessel keeps its IMO number', r.status === 201 && r.json.data.imoNumber === '9123456', msg(r))
  if (r.json?.data?._id) created.vesselIds.push(r.json.data._id)

  // temp Egypt port + temp container type that carries capacity numbers
  r = await admin('POST', '/master/ports', { name: `${RUN} Port`, code: 'ZEG', country: 'Egypt' })
  check('temp Egypt port created', r.status === 201, msg(r))
  const egPort = r.json?.data
  created.portIds.push(egPort._id)
  const polPort = ports.find((p) => !/egypt/i.test(p.country || '')) || ports[0]
  r = await admin('POST', '/master/container-types', { code: '20ZZ', label: `${RUN} 20ft`, maxPayloadKg: 28000, capacityCbm: 33, tareWeightKg: 2300 })
  check('temp container type with payload / capacity / tare created', r.status === 201 && r.json.data.tareWeightKg === 2300, msg(r))
  const tType = r.json?.data
  created.typeIds.push(tType._id)
  r = await admin('POST', '/master/containers/quick-add', { containerType: tType._id, nvocc: nvocc._id, depot: depot._id, quantity: 4 })
  check('seed 4 units of the temp type', r.status === 201 && r.json.data.createdCount === 4, msg(r))

  const mk = async (n, extra = {}) => {
    const res = await admin('POST', '/export/bookings', {
      clientName: `${RUN}-${n}`, clientPhone: '+20100000000', clientEmail: 'e2e@example.com',
      pol: polPort._id, pod: egPort._id, commodity: 'E2E frozen goods',
      containers: [{ containerType: tType._id, quantity: 2 }], nvocc: nvocc._id, ...extra,
    })
    if (res.status === 201) { created.bookingIds.push(res.json.data._id); created.jobNos.push(res.json.data.jobNo) }
    return res
  }
  const put = (id, body) => admin('PUT', `/export/bookings/${id}`, body)
  const putBl = (id, body) => admin('PUT', `/export/bookings/${id}/bl`, body)
  const complete = (id, n) => admin('POST', `/export/bookings/${id}/steps/${n}/complete`)
  const reopen = (id, n, reason) => admin('POST', `/export/bookings/${id}/steps/${n}/reopen`, reason === undefined ? {} : { reason })
  const state = async (id) => (await admin('GET', `/export/bookings/${id}`)).json?.state

  // ═══ Step 1 — fields, validation ═══════════════════════════════════
  r = await mk('flow')
  check('create a job -> 201 and the response carries the job state', r.status === 201 && !!r.json.state?.stepIssues && r.json.state.lifecycle?.stage === 'Job opened', msg(r))
  const job = r.json.data
  check('bookingType is always SOC', job.bookingType === 'SOC', job.bookingType)

  r = await put(job._id, { acidNumber: '123' })
  check('ACID that is not 19 digits -> 400', r.status === 400 && /19 digits/.test(msg(r)), msg(r))
  r = await put(job._id, { grossWeight: 100, netWeight: 200 })
  check('net weight above gross weight -> 400', r.status === 400 && /net weight/i.test(msg(r)), msg(r))
  r = await put(job._id, { stuffingLocationType: 'Moon base' })
  check('invalid stuffing location type -> 400', r.status === 400, msg(r))

  r = await complete(job._id, 1)
  check('completing Step 1 with nothing filled -> 400 and a list of issues', r.status === 400 && r.json.issues?.length >= 8, msg(r))
  check('...the issues name the ACID rule for an Egypt POD', (r.json.issues || []).some((i) => /ACID/.test(i)), JSON.stringify(r.json.issues))
  check('...and the missing POD agent / parties', (r.json.issues || []).some((i) => /POD agent/.test(i)) && (r.json.issues || []).some((i) => /Shipper/.test(i)))
  r = await complete(job._id, 2)
  check('Step 2 cannot be completed before Step 1', r.status === 400 && /Complete Step 1 first/.test(msg(r)), msg(r))
  r = await complete(job._id, 9)
  check('step number out of range -> 400', r.status === 400, r.status)

  // capacity: 2 x 28000 payload
  r = await put(job._id, { grossWeight: 70000, netWeight: 60000 })
  const stCap = await state(job._id)
  check('gross weight above the container capacity is reported as a Step 1 issue', (stCap?.stepIssues?.[1] || []).some((i) => /payload capacity/.test(i)), JSON.stringify(stCap?.stepIssues?.[1]))

  const step1 = {
    cargoReadinessDate: day(-6), proformaInvoiceNo: 'PI-E2E-1', proformaInvoiceDate: day(-7), hsCode: '0207.14',
    packagesCount: 400, packageType: 'Cartons', grossWeight: 40000, netWeight: 38000, cbm: 50, countryOfOrigin: 'Egypt',
    stuffingLocationType: 'Depot CFS', acidNumber: '1234567890123456789',
    shipper: { name: 'E2E Shipper Co', address: 'Addr S' }, consignee: { name: 'E2E Consignee Co' }, notify: { name: 'E2E Notify Co' },
    podAgent: { name: 'E2E Agent', email: 'prealert-e2e@example.com' },
  }
  r = await put(job._id, step1)
  check('save all Step 1 fields', r.status === 200 && r.json.data.proformaInvoiceNo === 'PI-E2E-1' && r.json.data.acidNumber === '1234567890123456789', msg(r))
  check('the new fields round-trip (country of origin, stuffing type, CBM)', r.json.data.countryOfOrigin === 'Egypt' && r.json.data.stuffingLocationType === 'Depot CFS' && r.json.data.cbm === 50)
  const st1 = r.json.state
  check('Step 1 now has no issues', st1.stepIssues[1].length === 0, JSON.stringify(st1.stepIssues[1]))

  // ═══ G5 — complete + lock, G1 — amend ═══════════════════════════════
  r = await complete(job._id, 1)
  check('complete Step 1 -> 200, stamped', r.status === 200 && r.json.state.stepsCompleted.includes(1), msg(r))
  check('lifecycle becomes "S/D Prelim Complete"', r.json.state.lifecycle.stage === 'S/D Prelim Complete', r.json.state.lifecycle.stage)
  r = await complete(job._id, 1)
  check('completing it again -> 400', r.status === 400 && /already complete/.test(msg(r)), msg(r))
  r = await put(job._id, { commodity: 'changed after the step was completed' })
  check('editing a field of a completed step -> 409 (locked)', r.status === 409 && /locked|complete/i.test(msg(r)), `${r.status} ${msg(r)}`)
  r = await put(job._id, { commodity: 'E2E frozen goods', hsCode: '0207.14', containers: [{ containerType: tType._id, quantity: 2 }], shipper: { name: 'E2E Shipper Co', address: 'Addr S' }, grossWeight: '40000' })
  check('re-sending the SAME values of locked fields (text, list, object, number-as-string) is fine', r.status === 200, `${r.status} ${msg(r)}`)
  r = await put(job._id, { notes: 'follow-up note', jobStatus: 'in_progress' })
  check('follow-up data (notes, job status) stays editable on a completed step', r.status === 200 && r.json.data.jobStatus === 'in_progress', msg(r))

  r = await reopen(job._id, 1)
  check('amend without a reason -> 400', r.status === 400 && /reason/i.test(msg(r)), msg(r))
  r = await reopen(job._id, 3, 'because')
  check('amend a step that is not complete -> 400', r.status === 400, msg(r))

  // ═══ Step 2 — booking ═══════════════════════════════════════════════
  const step2 = {
    carrier: vo._id, vesselName: 'MV E2E', voyageNo: 'V001', carrierBookingRef: `${RUN}-BR`, polTerminal: 'Terminal A', podTerminal: 'TBA',
    etd: day(10), eta: day(25), siCutoff: day(7), vgmCutoff: day(7), cyGateInCutoff: day(8),
    spaceConfirmationStatus: 'Confirmed', confirmedEquipment: [{ containerType: tType._id, quantity: 2 }],
  }
  r = await put(job._id, step2)
  check('save Step 2 fields', r.status === 200, msg(r))
  r = await complete(job._id, 2)
  check('Step 2 needs the VO confirmation file', r.status === 400 && /confirmation file/i.test(msg(r) + JSON.stringify(r.json.issues)), msg(r))
  r = await put(job._id, { confirmedEquipment: [{ containerType: tType._id, quantity: 1 }] })
  const stEq = await state(job._id)
  check('confirmed equipment that does not cover the quantity is an issue (BR-2.2)', (stEq.stepIssues[2] || []).some((i) => /does not cover/.test(i)), JSON.stringify(stEq.stepIssues[2]))
  r = await put(job._id, { confirmedEquipment: [{ containerType: tType._id, quantity: 2 }], eta: day(5), etd: day(10) })
  const stEta = await state(job._id)
  check('ETA before ETD is an issue', (stEta.stepIssues[2] || []).some((i) => /ETA must be after ETD/.test(i)), JSON.stringify(stEta.stepIssues[2]))
  r = await put(job._id, { eta: day(25), siCutoff: day(11) })
  const stCut = await state(job._id)
  check('a cut-off after the ETD is an issue', (stCut.stepIssues[2] || []).some((i) => /SI cut-off must be before the ETD/.test(i)), JSON.stringify(stCut.stepIssues[2]))
  // upload the booking confirmation (multipart), restore the SI cut-off
  r = await admin('PUT', `/export/bookings/${job._id}`, (() => {
    const fd = new FormData()
    fd.append('siCutoff', day(7))
    fd.append('bookingConfirmationFile', new Blob([PNG_BYTES], { type: 'image/png' }), 'vo-confirmation.png')
    return fd
  })(), { form: true })
  check('upload the VO booking confirmation file', r.status === 200 && r.json.data.bookingConfirmationFile?.fileName === 'vo-confirmation.png', msg(r))
  r = await complete(job._id, 2)
  check('complete Step 2 -> 200', r.status === 200 && r.json.state.stepsCompleted.includes(2), msg(r))
  check('lifecycle becomes "Booked"', r.json.state.lifecycle.stage === 'Booked', r.json.state.lifecycle.stage)

  // amend step 1 -> step 2 must be re-confirmed
  r = await reopen(job._id, 1, 'shipper corrected the packages')
  check('amend Step 1 with a reason -> 200', r.status === 200 && !r.json.state.stepsCompleted.includes(1), msg(r))
  check('...a later completed step is flagged Re-confirm', r.json.state.reconfirmSteps.includes(2), JSON.stringify(r.json.state.reconfirmSteps))
  check('...the amendment is recorded on the job', r.json.data.amendments?.some((a) => a.step === 1 && /shipper corrected/.test(a.reason)))
  r = await put(job._id, { packagesCount: 410 })
  check('the amended step can be edited again', r.status === 200 && r.json.data.packagesCount === 410, msg(r))
  r = await complete(job._id, 2)
  check('a reconfirm of Step 2 is refused while Step 1 is open', r.status === 400 && /Complete Step 1 first/.test(msg(r)), msg(r))
  r = await put(job._id, { packagesCount: 400 })
  r = await complete(job._id, 1)
  check('complete Step 1 again', r.status === 200, msg(r))
  r = await complete(job._id, 2)
  check('re-confirm Step 2 clears the flag', r.status === 200 && r.json.state.reconfirmSteps.length === 0, JSON.stringify(r.json?.state?.reconfirmSteps) + msg(r))
  r = await admin('GET', '/audit-logs?resource=Booking&limit=100')
  check('audit log has STEP_COMPLETE and STEP_AMEND', (r.json?.logs || []).some((l) => l.action === 'STEP_COMPLETE' && l.resourceId === job.jobNo) && (r.json?.logs || []).some((l) => l.action === 'STEP_AMEND' && l.resourceId === job.jobNo), `n=${r.json?.logs?.length}`)

  // ═══ Step 3 — CRO, container grid, VGM, reconciliation ══════════════
  r = await complete(job._id, 3)
  check('Step 3 needs a confirmed booking with allocated containers', r.status === 400 && /confirmed/i.test(msg(r) + JSON.stringify(r.json.issues)), msg(r))
  r = await put(job._id, { depot: depot._id, croNumber: 'CRO-E2E-1', croIssueDate: day(-5), croValidityDate: day(5), croIssuedBy: 'Carrier', releasedTo: 'E2E Trucking', truckPlateDriver: 'ABC 123 / Driver' })
  check('save the Release Order block', r.status === 200 && r.json.data.croNumber === 'CRO-E2E-1' && r.json.data.croIssuedBy === 'Carrier', msg(r))
  r = await admin('PUT', `/export/bookings/${job._id}/confirm`)
  check('confirm the booking (allocate 2 containers)', r.status === 200 && r.json.data.status === 'confirmed', msg(r))
  const units = (await admin('GET', `/master/containers?booking=${job._id}`)).json?.data || []
  check('2 units allocated', units.length === 2, units.length)
  const [u1, u2] = units
  const unitPut = (u, body) => admin('PUT', `/master/containers/${u._id}`, body)

  r = await unitPut(u1, { payloadWeightKg: 30000 })
  check('payload above the type\'s maximum -> 400', r.status === 400 && /maximum/i.test(msg(r)), msg(r))
  r = await unitPut(u1, { cbm: 40 })
  check('CBM above the type\'s capacity -> 400', r.status === 400 && /capacity/i.test(msg(r)), msg(r))
  r = await unitPut(u1, { gateOutDate: day(-2), gateInDate: day(-3) })
  check('gate-in before gate-out -> 400', r.status === 400 && /before gate-out/i.test(msg(r)), msg(r))
  r = await unitPut(u1, { vgmMethod: 3 })
  check('VGM method must be 1 or 2', r.status === 400, msg(r))

  const goodUnit = (n, over = {}) => ({
    sealNumber: `SEAL-${n}`, customsSealNo: `CS-${n}`, payloadWeightKg: 20000, cbm: 25, packagesInContainer: 200,
    vgmMethod: 2, packingWeightKg: 100, vgmDeclaredBy: 'E2E Signatory', vgmSubmittedAt: day(-2),
    conditionAtGateOut: 'Sound', gateOutEirNo: `EIR-O-${n}`, gateInEirNo: `EIR-I-${n}`, gateOutDate: day(-3), gateInDate: day(-2), ...over,
  })
  r = await unitPut(u1, goodUnit(1))
  check('VGM method 2 is calculated: tare 2300 + payload 20000 + packing 100 = 22400', r.status === 200 && r.json.data.vgmWeightKg === 22400, msg(r) + ' ' + r.json?.data?.vgmWeightKg)
  r = await unitPut(u1, { vgmMethod: 1, vgmWeightKg: 20000 })
  check('VGM method 1 below tare + payload -> 400', r.status === 400 && /below tare \+ payload/i.test(msg(r)), msg(r))
  r = await unitPut(u1, { vgmMethod: 1, vgmWeightKg: 22300, weighbridgeTicket: 'WB-1' })
  check('VGM method 1 at or above tare + payload is accepted', r.status === 200 && r.json.data.vgmWeightKg === 22300, msg(r))
  r = await unitPut(u1, { vgmMethod: 2 })
  check('...switching back to method 2 recalculates it', r.status === 200 && r.json.data.vgmWeightKg === 22400, msg(r))
  r = await unitPut(u1, { vgmSubmittedAt: day(9) })
  check('a VGM submitted after the VGM cut-off is accepted with a warning', r.status === 200 && (r.json.warnings || []).some((w) => /late/i.test(w)), msg(r) + JSON.stringify(r.json?.warnings))
  r = await unitPut(u1, { vgmSubmittedAt: day(-2) })

  // second unit deliberately off (payload 10000 vs 40000 gross) -> reconciliation fails
  r = await unitPut(u2, goodUnit(2, { payloadWeightKg: 10000, cbm: 12, packagesInContainer: 100 }))
  check('fill the second container', r.status === 200, msg(r))
  r = await admin('GET', `/export/bookings/${job._id}/reconciliation`)
  const rec = r.json?.data
  check('reconciliation panel: count ok, weight / volume / packages fail', r.status === 200 && rec.checks.find((c) => c.key === 'count').pass && !rec.checks.find((c) => c.key === 'weight').pass && !rec.checks.find((c) => c.key === 'volume').pass && !rec.checks.find((c) => c.key === 'packages').pass && rec.pass === false, JSON.stringify(rec))
  r = await complete(job._id, 3)
  check('a failed reconciliation blocks Step 3 without a reason', r.status === 400 && /Reconciliation/.test(msg(r) + JSON.stringify(r.json.issues)), msg(r))
  r = await put(job._id, { reconciliationReason: 'second box shipped part-loaded, agreed with the shipper' })
  r = await complete(job._id, 3)
  check('with a variance reason Step 3 completes', r.status === 200 && r.json.state.stepsCompleted.includes(3), msg(r))
  check('lifecycle reaches "Gated In" (every container has a gate-in date)', r.json.state.lifecycle.stage === 'Gated In', r.json.state.lifecycle.stage)
  r = await unitPut(u1, { sealNumber: 'CHANGED' })
  check('a container of a completed Step 3 is locked -> 409', r.status === 409, `${r.status} ${msg(r)}`)
  r = await put(job._id, { croNumber: 'CRO-CHANGED' })
  check('the Release Order of a completed Step 3 is locked -> 409', r.status === 409, `${r.status} ${msg(r)}`)

  // ═══ Step 4 — Final S/D ══════════════════════════════════════════════
  r = await putBl(job._id, { exactShipper: 'LINE1\nLINE2\nLINE3\nLINE4\nLINE5\nLINE6', exactConsignee: 'X'.repeat(36) })
  check('over-long exact texts still save (a long party name must not block unrelated B&L saves)', r.status === 200, msg(r))
  const stEdi = await state(job._id)
  check('...but the EDI limit (5 lines x 35 characters) is a Step 4 issue', (stEdi.stepIssues[4] || []).some((i) => /more than 5 lines/.test(i)) && (stEdi.stepIssues[4] || []).some((i) => /longer than 35/.test(i)), JSON.stringify(stEdi.stepIssues[4]))
  r = await admin('POST', `/export/bookings/${job._id}/bl/draft`)
  check('Generate Draft B/L needs the exact parties first', r.status === 400 && /exact shipper/i.test(msg(r)), msg(r))
  const step4 = {
    exactShipper: 'E2E SHIPPER CO\nADDR S', exactConsignee: 'TO ORDER OF E2E BANK', exactNotify: 'SAME AS CONSIGNEE', marksAndNumbers: 'N/M',
    exactDescription: 'FROZEN GOODS', finalTotalPackages: 400, finalGrossWeight: 40000, finalCbm: 50, finalPackageType: 'Cartons',
    commercialInvoiceNo: 'CI-E2E-1', commercialInvoiceDate: day(-3), exportCustomsDeclarationNo: 'CD-E2E-1', siSubmittedToVoAt: day(-8),
  }
  r = await putBl(job._id, step4)
  check('save the Step 4 fields through the B&L API', r.status === 200 && r.json.data.exactShipper === 'E2E SHIPPER CO\nADDR S', msg(r))
  r = await complete(job._id, 4)
  check('Step 4 needs a draft and the shipper\'s approval', r.status === 400 && /draft/i.test(msg(r) + JSON.stringify(r.json.issues)), msg(r))
  r = await admin('POST', `/export/bookings/${job._id}/bl/draft`)
  check('Generate Draft B/L -> version 1, status Pending', r.status === 200 && r.json.data.blDrafts.length === 1 && r.json.data.blDraftVersion === 'v1' && r.json.data.clientConfirmationStatus === 'Pending', msg(r))
  r = await admin('GET', `/export/bookings/${job._id}/bl/draft.pdf`, undefined, { raw: true })
  check('draft B/L PDF downloads', r.status === 200 && /pdf/.test(r.headers.get('content-type')) && r.bytes.subarray(0, 4).toString() === '%PDF', r.status)
  r = await putBl(job._id, { clientConfirmationStatus: 'Confirmed', approvedAt: day(-1), approvedBy: 'Shipper Rep' })
  check('shipper approval saved', r.status === 200 && r.json.data.clientConfirmationStatus === 'Confirmed', msg(r))
  r = await putBl(job._id, { marksAndNumbers: 'SEE ATTACHED' })
  check('changing B/L content after an approval resets it to Pending (BR-4.4)', r.status === 200 && r.json.data.clientConfirmationStatus === 'Pending' && !r.json.data.approvedAt, msg(r))
  r = await complete(job._id, 4)
  check('...so Step 4 cannot complete until it is approved again', r.status === 400 && /Approved/.test(msg(r) + JSON.stringify(r.json.issues)), msg(r))
  r = await admin('POST', `/export/bookings/${job._id}/bl/draft`)
  check('a second draft -> version 2', r.status === 200 && r.json.data.blDrafts.length === 2 && r.json.data.blDraftVersion === 'v2', msg(r))
  r = await putBl(job._id, { clientConfirmationStatus: 'Confirmed', approvedAt: day(-1), approvedBy: 'Shipper Rep' })
  const stFin = await state(job._id)
  check('final totals off the container sums need a variance reason (BR-4.2)', (stFin.stepIssues[4] || []).some((i) => /variance reason/.test(i)), JSON.stringify(stFin.stepIssues[4]))
  r = await putBl(job._id, { finalVarianceReason: 'second box part-loaded, packing list attached', clientConfirmationStatus: 'Confirmed', approvedAt: day(-1), approvedBy: 'Shipper Rep' })
  check('...with the reason saved the approval stays (reason is not B/L content)', r.status === 200 && r.json.data.clientConfirmationStatus === 'Confirmed', msg(r))
  r = await complete(job._id, 4)
  check('complete Step 4 -> 200', r.status === 200 && r.json.state.stepsCompleted.includes(4), msg(r))
  check('lifecycle becomes "Final S/D Approved"', r.json.state.lifecycle.stage === 'Final S/D Approved', r.json.state.lifecycle.stage)
  r = await putBl(job._id, { exactShipper: 'CHANGED' })
  check('B/L content of a completed Step 4 is locked -> 409', r.status === 409, `${r.status} ${msg(r)}`)
  r = await admin('POST', `/export/bookings/${job._id}/bl/draft`)
  check('a new draft on a completed Step 4 -> 409 (amend first)', r.status === 409, `${r.status} ${msg(r)}`)

  // ═══ Step 5 — sailing, HBL, MBL, actions ═════════════════════════════
  r = await admin('POST', `/export/bookings/${job._id}/bl/issue`)
  check('Issue HBL without the Step 5 data -> 400 with issues', r.status === 400 && r.json.issues?.length >= 5, msg(r))
  r = await admin('GET', `/export/bookings/${job._id}/bl/actions`)
  check('action states: loading list ready, DG manifest disabled (no DG), Issue HBL disabled with a reason', r.status === 200 && r.json.data.loadingList.enabled === true && r.json.data.dgManifest.enabled === false && r.json.data.issueHbl.enabled === false && !!r.json.data.issueHbl.reason, JSON.stringify(r.json?.data))
  r = await admin('GET', `/export/bookings/${job._id}/bl/loading-list.xlsx`, undefined, { raw: true })
  check('loading list downloads as an Excel file', r.status === 200 && r.bytes.subarray(0, 2).toString() === 'PK', r.status)
  r = await admin('GET', `/export/bookings/${job._id}/bl/dg-manifest.pdf`, undefined, { raw: true })
  check('DG manifest on a non-DG job -> 400', r.status === 400, r.status)
  r = await admin('GET', `/export/bookings/${job._id}/bl/hbl.pdf`, undefined, { raw: true })
  check('HBL PDF before issuing -> 400', r.status === 400, r.status)

  const step5 = {
    blType: 'Telex Release', freightTermsOnBL: 'Freight Prepaid', freightPayableAt: 'Origin', freightPaymentStatus: 'Unpaid',
    atd: day(-1), shippedOnBoardDate: day(-1), placeOfIssue: 'Cairo', dateOfIssue: new Date().toISOString(), signatoryName: 'E2E Signer', signatoryTitle: 'Manager',
  }
  r = await putBl(job._id, step5)
  check('save the Step 5 fields through the B&L API (ATD included)', r.status === 200 && r.json.data.placeOfIssue === 'Cairo' && !!r.json.data.atd, msg(r))
  r = await admin('POST', `/export/bookings/${job._id}/bl/issue`)
  check('Prepaid + Unpaid = release hold blocks the HBL (BR-5.2)', r.status === 400 && /hold|override/i.test(msg(r) + JSON.stringify(r.json.issues)), msg(r))
  r = await putBl(job._id, { holdOverrideReason: 'Finance approved release against the customer\'s credit' })
  r = await putBl(job._id, { shippedOnBoardDate: day(2) })
  r = await admin('POST', `/export/bookings/${job._id}/bl/issue`)
  check('a shipped-on-board date in the future is refused', r.status === 400 && /future/i.test(msg(r) + JSON.stringify(r.json.issues)), msg(r))
  r = await putBl(job._id, { shippedOnBoardDate: day(-9) })
  r = await admin('POST', `/export/bookings/${job._id}/bl/issue`)
  check('shipped-on-board before the gate-in is refused', r.status === 400 && /gate-in|days from the ATD/i.test(msg(r) + JSON.stringify(r.json.issues)), msg(r))
  r = await putBl(job._id, { shippedOnBoardDate: day(-1) })

  r = await admin('POST', `/export/bookings/${job._id}/bl/issue`)
  check('Issue HBL -> 200', r.status === 200 && !!r.json.data.hblIssuedAt && r.json.data.hblVersion === 1, msg(r))
  const issued = r.json.data
  created.hblNumbers.push(issued.hblNumber)
  check('HBL number auto-generated in the carrier\'s own series (E2E + yy + 5 digits)', /^E2E\d{7}$/.test(issued.hblNumber || ''), issued.hblNumber)
  check('Step 5 is stamped complete and the lifecycle is "BL Issued"', r.json.state.stepsCompleted.includes(5) && r.json.state.lifecycle.stage === 'BL Issued', r.json.state.lifecycle.stage)
  const afterUnits = (await admin('GET', `/master/containers?booking=${job._id}`)).json?.data || []
  check('containers are marked Departed (stock moves to Shipped)', afterUnits.length === 2 && afterUnits.every((u) => u.containerStatus === 'Departed'), JSON.stringify(afterUnits.map((u) => u.containerStatus)))
  r = await admin('POST', `/export/bookings/${job._id}/bl/issue`)
  check('issuing twice -> 400', r.status === 400, msg(r))
  r = await put(job._id, { commodity: 'locked' })
  check('after the HBL the whole job is locked -> 409', r.status === 409 && /HBL has been issued/.test(msg(r)), `${r.status} ${msg(r)}`)
  r = await putBl(job._id, { signatoryName: 'someone else' })
  check('...including the B&L fields -> 409', r.status === 409, `${r.status} ${msg(r)}`)
  r = await unitPut(u1, { sealNumber: 'LATE' })
  check('...and the container grid -> 409', r.status === 409, `${r.status} ${msg(r)}`)
  r = await admin('PUT', `/export/bookings/${job._id}/cancel`)
  check('cancelling a job whose HBL is issued -> 409', r.status === 409 && /HBL has been issued/.test(msg(r)), `${r.status} ${msg(r)}`)
  r = await put(job._id, { jobStatus: 'completed', notes: 'closing note' })
  check('follow-up data is still editable after issue', r.status === 200 && r.json.data.jobStatus === 'completed', msg(r))
  r = await reopen(job._id, 2, 'try to amend')
  check('Amend of a step while issued -> 409 (use Re-issue)', r.status === 409, `${r.status} ${msg(r)}`)
  r = await admin('GET', `/export/bookings/${job._id}/bl/hbl.pdf`, undefined, { raw: true })
  check('final HBL PDF downloads', r.status === 200 && r.bytes.subarray(0, 4).toString() === '%PDF', r.status)

  // pre-alert
  r = await admin('POST', `/export/bookings/${job._id}/bl/pre-alert`)
  check('pre-alert without the MBL number -> 400', r.status === 400 && /MBL number/.test(msg(r)), msg(r))
  r = await putBl(job._id, { mblNumber: `${RUN}-MBL`, mblShipper: 'E2E Carrier', mblConsignee: 'E2E Agent' })
  check('MBL fields are follow-up data? no — locked after issue -> 409', r.status === 409, `${r.status} ${msg(r)}`)

  // re-issue unlocks Step 5 only
  r = await admin('POST', `/export/bookings/${job._id}/bl/reissue`, {})
  check('re-issue without a reason -> 400', r.status === 400, msg(r))
  r = await admin('POST', `/export/bookings/${job._id}/bl/reissue`, { reason: 'consignee name corrected on the MBL' })
  check('re-issue with a reason -> 200, not issued any more', r.status === 200 && !r.json.data.hblIssuedAt && !r.json.state.stepsCompleted.includes(5), msg(r))
  check('...the replaced HBL is kept in the history', r.json.data.hblHistory?.length === 1 && r.json.data.hblHistory[0].number === issued.hblNumber && !!r.json.data.hblHistory[0].replacedAt)
  r = await putBl(job._id, { mblNumber: `${RUN}-MBL`, mblShipper: 'E2E Carrier', mblConsignee: 'E2E Agent', mblReleaseType: 'Telex Release', mblFreightTerms: 'Freight Prepaid' })
  check('MBL fields can be saved again after the re-issue was opened', r.status === 200 && r.json.data.mblNumber === `${RUN}-MBL`, `${r.status} ${msg(r)}`)
  r = await admin('POST', `/export/bookings/${job._id}/bl/issue`)
  check('issue again -> version 2, same HBL number', r.status === 200 && r.json.data.hblVersion === 2 && r.json.data.hblNumber === issued.hblNumber, msg(r))
  r = await admin('POST', `/export/bookings/${job._id}/bl/pre-alert`)
  check('pre-alert to the POD agent -> 200, logged with the recipient', r.status === 200 && r.json.data.preAlerts?.length === 1 && r.json.data.preAlerts[0].recipients.includes('prealert-e2e@example.com') && r.json.data.preAlertSent === true, msg(r))
  check('lifecycle becomes "Pre-alerted"', r.json.state.lifecycle.stage === 'Pre-alerted', r.json.state.lifecycle.stage)
  r = await admin('POST', `/export/bookings/${job._id}/bl/pre-alert/ack`)
  check('acknowledge the pre-alert', r.status === 200 && !!r.json.data.preAlerts[0].acknowledgedAt, msg(r))
  r = await admin('POST', `/export/bookings/${job._id}/bl/pre-alert/ack`)
  check('a second acknowledgement -> 400', r.status === 400, msg(r))
  r = await admin('GET', '/audit-logs?resource=Booking&limit=200')
  const acts = (r.json?.logs || []).filter((l) => l.resourceId === job.jobNo).map((l) => l.action)
  check('audit log has BL_DRAFT, HBL_ISSUE, HBL_REISSUE, PRE_ALERT', ['BL_DRAFT', 'HBL_ISSUE', 'HBL_REISSUE', 'PRE_ALERT'].every((a) => acts.includes(a)), JSON.stringify([...new Set(acts)]))

  // ═══ roll-over ═══════════════════════════════════════════════════════
  r = await mk('roll')
  const rollJob = r.json.data
  r = await admin('POST', `/export/bookings/${rollJob._id}/roll`, {})
  check('roll-over without a reason -> 400', r.status === 400, msg(r))
  r = await put(rollJob._id, { vesselName: 'MV FIRST', voyageNo: 'V1', etd: day(10) })
  r = await admin('POST', `/export/bookings/${rollJob._id}/roll`, { reason: 'vessel omitted the port call' })
  check('roll-over snapshots the booking into a numbered version and sets Rolled', r.status === 200 && r.json.data.spaceConfirmationStatus === 'Rolled' && r.json.data.bookingVersions.length === 1 && r.json.data.bookingVersions[0].snapshot.vesselName === 'MV FIRST', msg(r))
  check('...and the job state shows the Rolled exception', r.json.state.lifecycle.exception === 'Rolled', JSON.stringify(r.json.state.lifecycle))

  // ═══ warnings ════════════════════════════════════════════════════════
  r = await mk('dup-ref', { carrier: vo._id, carrierBookingRef: `${RUN}-BR` })
  const dup = r.json.data
  const stDup = await state(dup._id)
  check('the same VO booking reference on another job is a warning', (stDup?.warnings || []).some((w) => w.step === 2 && /already used/.test(w.message)), JSON.stringify(stDup?.warnings))

  // ═══ RBAC for the new endpoints ═════════════════════════════════════
  const roleBl = await admin('POST', '/roles', { name: `${RUN}-bl-only`.toLowerCase(), permissions: ['bl:read', 'bl:update'], description: 'E2E temp role' })
  const roleBk = await admin('POST', '/roles', { name: `${RUN}-booking-only`.toLowerCase(), permissions: ['booking:read', 'booking:update'], description: 'E2E temp role' })
  if (roleBl.json?.data?._id) created.roleIds.push(roleBl.json.data._id)
  if (roleBk.json?.data?._id) created.roleIds.push(roleBk.json.data._id)
  await mongoose.connect(process.env.MONGO_URI)
  db = mongoose.connection.db
  const pass = 'E2ETestPass123!'
  const passwordHash = await hashPassword(pass)
  const mkUser = async (label, role) => {
    const email = `e2e-prd-${label}-${RUN}@example.com`.toLowerCase()
    const u = await db.collection('users').insertOne({ name: `E2E ${label}`, email, passwordHash, role: new mongoose.Types.ObjectId(role), status: 'active', createdAt: new Date(), updatedAt: new Date() })
    created.userIds.push(u.insertedId.toString())
    return email
  }
  const blOnly = session(), bookingOnly = session()
  await blOnly('POST', '/auth/login', { email: await mkUser('bl', roleBl.json.data._id), password: pass }, { noAuth: true })
  await bookingOnly('POST', '/auth/login', { email: await mkUser('bk', roleBk.json.data._id), password: pass }, { noAuth: true })
  r = await blOnly('POST', `/export/bookings/${dup._id}/steps/1/complete`)
  check('bl-only user: complete Step 1 -> 403', r.status === 403, r.status)
  r = await blOnly('POST', `/export/bookings/${dup._id}/steps/4/reopen`, { reason: 'x y z' })
  check('bl-only user: Step 4 amend is allowed (400 = not complete, not 403)', r.status === 400, `${r.status} ${msg(r)}`)
  r = await blOnly('POST', `/export/bookings/${dup._id}/roll`, { reason: 'x y z' })
  check('bl-only user: roll-over -> 403', r.status === 403, r.status)
  r = await blOnly('GET', `/export/bookings/${job._id}/bl/actions`)
  check('bl-only user: action states -> 200', r.status === 200, r.status)
  r = await blOnly('GET', `/export/bookings/${job._id}/bl`)
  check('bl-only user: B&L projection still hides price / cost / carrier / containers', r.status === 200 && r.json.data.price === undefined && r.json.data.cost === undefined && r.json.data.carrier === undefined && r.json.data.containers === undefined && r.json.data.nvocc === undefined, JSON.stringify(Object.keys(r.json?.data || {})))
  check('...but carries the step stamps and the new Step 4 / 5 fields', Array.isArray(r.json.data.stepsCompleted) && r.json.data.hblNumber === issued.hblNumber && r.json.data.exactShipper !== undefined)
  r = await bookingOnly('POST', `/export/bookings/${dup._id}/steps/1/complete`)
  check('booking-only user: complete Step 1 reaches the rule engine (400, not 403)', r.status === 400, `${r.status} ${msg(r)}`)
  r = await bookingOnly('POST', `/export/bookings/${dup._id}/steps/4/complete`)
  check('booking-only user: complete Step 4 -> 403', r.status === 403, r.status)
  r = await bookingOnly('POST', `/export/bookings/${job._id}/bl/issue`)
  check('booking-only user: Issue HBL -> 403', r.status === 403, r.status)
  r = await bookingOnly('GET', `/export/bookings/${job._id}/bl/loading-list.xlsx`)
  check('booking-only user: loading list -> 403', r.status === 403, r.status)
  r = await bookingOnly('GET', `/export/bookings/${job._id}/reconciliation`)
  check('booking-only user: reconciliation -> 200', r.status === 200, r.status)
} catch (err) {
  check('test run completed without an unexpected error', false, err.stack || err.message)
} finally {
  try {
    if (!db) await mongoose.connect(process.env.MONGO_URI)
    db = mongoose.connection.db
    const oid = (id) => new mongoose.Types.ObjectId(id)
    const delContainers = created.typeIds.length ? await db.collection('containers').deleteMany({ containerType: { $in: created.typeIds.map(oid) } }) : { deletedCount: 0 }
    const delBookings = created.bookingIds.length ? await db.collection('bookings').deleteMany({ _id: { $in: created.bookingIds.map(oid) } }) : { deletedCount: 0 }
    if (created.typeIds.length) await db.collection('containertypes').deleteMany({ _id: { $in: created.typeIds.map(oid) } })
    if (created.vesselIds.length) await db.collection('vessels').deleteMany({ _id: { $in: created.vesselIds.map(oid) } })
    if (created.nvoccIds.length) await db.collection('nvoccs').deleteMany({ _id: { $in: created.nvoccIds.map(oid) } })
    if (created.voIds.length) await db.collection('vesseloperators').deleteMany({ _id: { $in: created.voIds.map(oid) } })
    if (created.portIds.length) await db.collection('ports').deleteMany({ _id: { $in: created.portIds.map(oid) } })
    const delUsers = created.userIds.length ? await db.collection('users').deleteMany({ _id: { $in: created.userIds.map(oid) } }) : { deletedCount: 0 }
    const delRoles = created.roleIds.length ? await db.collection('roles').deleteMany({ _id: { $in: created.roleIds.map(oid) } }) : { deletedCount: 0 }
    const year = new Date().getFullYear()
    for (const jobNo of [...created.jobNos].reverse()) {
      const seq = Number(/-(\d+)$/.exec(jobNo)?.[1])
      if (!seq) continue
      const res = await db.collection('jobcounters').updateOne({ _id: `job-${year}`, seq }, { $inc: { seq: -1 } })
      if (!res.modifiedCount) break
    }
    for (const n of created.hblNumbers) {
      const m = /^(.*?)(\d{2})(\d{5})$/.exec(n)
      if (m) await db.collection('jobcounters').updateOne({ _id: `hbl-${m[1]}-${m[2]}`, seq: Number(m[3]) }, { $inc: { seq: -1 } })
    }
    console.log(`cleanup: removed ${delBookings.deletedCount} booking(s), ${delContainers.deletedCount} container unit(s), ${delUsers.deletedCount} user(s), ${delRoles.deletedCount} role(s), ${created.portIds.length} port(s), ${created.typeIds.length} container type(s)`)
    await mongoose.disconnect()
  } catch (e) { console.log('CLEANUP FAILED — remove E2E-BOOKING-PRD data by hand:', e.message) }
  const failed = results.filter((x) => !x.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed, run=${RUN}`)
  process.exitCode = failed.length ? 1 : 0
}
