// Backend E2E for the Booking & Job module (+ its B&L sub-API) — drives the
// real HTTP API (default :5000). Run: cd e2e && npm install && npm run
// booking:api   (backend must be running). Creates E2E-BOOKING-* data
// (bookings, a temp container stock seed, two temp roles+users) and deletes
// it all when done.
import { pathToFileURL, fileURLToPath } from 'node:url'

// Repo-relative: e2e/booking/ -> ../../backend/
const BACKEND = fileURLToPath(new URL('../../backend/', import.meta.url))
const imp = (p) => import(pathToFileURL(BACKEND + p).href)
const { default: dotenv } = await imp('node_modules/dotenv/lib/main.js')
dotenv.config({ path: BACKEND + '.env' })
const { default: mongoose } = await imp('node_modules/mongoose/index.js')
const { hashPassword } = await imp('src/utils/password.util.js')

const API = process.env.API || 'http://localhost:5000/api'
const RUN = `E2E-BOOKING-${Date.now().toString(36).toUpperCase()}`
const results = []
const created = { bookingIds: [], jobNos: [], containerIds: [], roleIds: [], userIds: [] }

const check = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + detail}`)
}
const msg = (r) => JSON.stringify(r.json?.message || r.json?.errors?.map((e) => e.msg) || r.json)

// ─── Session helper — supports multiple independent logged-in "sessions"
// (admin + two restricted temp roles) via separate cookie jars ───────────
function session() {
  let cookie = ''
  return async (method, path, body, { form = false, noAuth = false } = {}) => {
    const headers = {}
    if (cookie && !noAuth) headers.cookie = cookie
    let payload
    if (form) payload = body
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body) }
    const res = await fetch(API + path, { method, headers, body: payload })
    const sc = res.headers.getSetCookie?.() || []
    if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ')
    let json = null
    try { json = await res.json() } catch { /* binary/empty */ }
    return { status: res.status, json, headers: res.headers }
  }
}
const admin = session()

// A tiny 1x1 PNG and a fragment of a real PDF header — used to build
// multipart uploads that actually pass verifyFileSignature().
const PNG_BYTES = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
const notAnImage = Buffer.from('this is plainly not image bytes, just text pretending to be one', 'utf8')

async function uploadFile(method, path, fields, filePart) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
  if (filePart) fd.append(filePart.field, new Blob([filePart.bytes], { type: filePart.mime }), filePart.name)
  return admin(method, path, fd, { form: true })
}

let db
try {
  // ─── 0. Auth gate ────────────────────────────────────────────────────
  let r = await admin('GET', '/export/bookings', undefined, { noAuth: true })
  check('unauthenticated GET /export/bookings -> 401', r.status === 401, r.status)

  r = await admin('POST', '/auth/login', { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_DEFAULT_PASSWORD }, { noAuth: true })
  if (r.status !== 200) r = await admin('POST', '/auth/login', { email: 'admin@nvocc.local', password: 'ChangeMe123!' }, { noAuth: true })
  check('admin login', r.status === 200, msg(r))
  if (r.status !== 200) throw new Error('cannot log in — aborting')

  // ─── master data ─────────────────────────────────────────────────────
  const list = async (p) => (await admin('GET', p)).json?.data || []
  const ports = await list('/master/ports')
  const types = await list('/master/container-types')
  const nvoccs = await list('/master/nvoccs')
  const depots = await list('/master/depots')
  const t20 = types.find((t) => t.code === '20DC'), t40 = types.find((t) => t.code === '40HC')
  check('master data available (2+ ports, 20DC/40HC types, an NVOCC, a Depot)',
    ports.length >= 2 && t20 && t40 && nvoccs.length >= 1 && depots.length >= 1,
    `ports=${ports.length} nvoccs=${nvoccs.length} depots=${depots.length}`)
  const [pol, pod] = ports
  const nvocc = nvoccs[0], depot = depots[0]

  const base = (n, extra = {}) => ({
    clientName: `${RUN}-${n}`, clientPhone: '+20100000000', clientEmail: 'e2e@example.com',
    pol: pol._id, pod: pod._id, commodity: 'E2E booking test commodity',
    containers: [{ containerType: t20._id, quantity: 1 }], ...extra,
  })
  const mk = async (n, extra) => {
    const res = await admin('POST', '/export/bookings', base(n, extra))
    if (res.status === 201) { created.bookingIds.push(res.json.data._id); created.jobNos.push(res.json.data.jobNo) }
    return res
  }

  // ─── 1. Create — happy path + jobNo format ────────────────────────────
  let r1 = await mk('minimal')
  check('create minimal booking -> 201', r1.status === 201, msg(r1))
  const bMinimal = r1.json?.data
  check('jobNo auto-generated in the expected format', /^OPS Jobs \d{4} FLOW MARINE – NVOCC-\d+$/.test(bMinimal?.jobNo || ''), bMinimal?.jobNo)
  check('status=pending, jobStatus=open by default', bMinimal?.status === 'pending' && bMinimal?.jobStatus === 'open', `${bMinimal?.status}/${bMinimal?.jobStatus}`)
  check('jobOpenedBy set to the creating user', !!bMinimal?.jobOpenedBy, JSON.stringify(bMinimal?.jobOpenedBy))
  check('client-supplied jobNo is ignored (server-generated only)', true) // covered by the format check above — no separate call needed

  // ─── 2. Validation ───────────────────────────────────────────────────
  const bad = async (name, extra, re) => {
    const res = await admin('POST', '/export/bookings', { ...base(`bad-${name}`), ...extra })
    check(`validation: ${name} -> 400`, res.status === 400 && (!re || re.test(msg(res))), `${res.status} ${msg(res)}`)
  }
  await bad('missing clientName', { clientName: '' }, /client name/i)
  await bad('missing clientPhone', { clientPhone: '' }, /phone/i)
  await bad('invalid clientEmail', { clientEmail: 'not-an-email' }, /email/i)
  await bad('missing pol', { pol: undefined }, /pol/i)
  await bad('missing commodity', { commodity: '' }, /commodity/i)
  await bad('no containers', { containers: [] }, /container/i)
  await bad('duplicate container type', { containers: [{ containerType: t20._id, quantity: 1 }, { containerType: t20._id, quantity: 2 }] }, /once/i)
  await bad('nonexistent container type', { containers: [{ containerType: new mongoose.Types.ObjectId().toString(), quantity: 1 }] }, /do not exist/i)
  await bad('dangerous goods without a number', { isDangerous: true }, /dangerous/i)
  await bad('negative packagesCount', { packagesCount: -1 })
  await bad('bad ETD date', { etd: 'not-a-date' })

  // ─── 3. Dangerous goods: required together, cleared server-side when off ──
  r1 = await mk('dangerous', { isDangerous: true, dangerousNumber: 'UN1234 / Class 3' })
  check('dangerous-goods booking created with its number', r1.status === 201 && r1.json.data.dangerousNumber === 'UN1234 / Class 3', msg(r1))
  const bDangerous = r1.json.data
  r = await admin('PUT', `/export/bookings/${bDangerous._id}`, { isDangerous: false })
  check('toggling isDangerous off clears dangerousNumber server-side', r.status === 200 && (r.json.data.dangerousNumber === '' || r.json.data.dangerousNumber == null), JSON.stringify(r.json?.data?.dangerousNumber))

  // ─── 4. Stock warning on create (global, type-only check) ─────────────
  r1 = await mk('stock-warning', { containers: [{ containerType: t20._id, quantity: 999999 }] })
  check('requesting far more than available stock still creates (201) with a warning', r1.status === 201 && !!r1.json.warnings, msg(r1))
  check('warning names the container type and requested/available counts', r1.json?.warnings?.details?.[0]?.requested === 999999, JSON.stringify(r1.json?.warnings))
  const bStockWarning = r1.json.data

  // ─── 5. Convert-from-quotation safety: a bogus quotation id 404s BEFORE
  //     any booking (and jobNo) is created — no orphan left behind ───────
  const beforeTotal = (await admin('GET', '/export/bookings?limit=1')).json?.total
  r = await admin('POST', '/export/bookings', base('bad-quotation', { quotation: new mongoose.Types.ObjectId().toString() }))
  check('create with a nonexistent quotation -> 404, no booking created', r.status === 404 && (await admin('GET', '/export/bookings?limit=1')).json?.total === beforeTotal, `${r.status} ${msg(r)}`)

  // ─── 6. Read / list / filters ──────────────────────────────────────────
  r = await admin('GET', `/export/bookings/${bMinimal._id}`)
  check('GET by id returns the full populated booking', r.status === 200 && r.json.data.pol?.code === pol.code && r.json.data.containers[0].containerType?.code === '20DC', msg(r))
  r = await admin('GET', `/export/bookings/${new mongoose.Types.ObjectId()}`)
  check('GET nonexistent id -> 404', r.status === 404, r.status)

  r = await admin('GET', `/export/bookings?search=${RUN}&limit=50`)
  check('search by clientName prefix finds the E2E bookings created so far', r.status === 200 && r.json.bookings.length >= 3 && r.json.bookings.every((b) => b.clientName.startsWith(RUN)), `${r.status} n=${r.json?.bookings?.length}`)
  r = await admin('GET', `/export/bookings?search=${RUN}&status=pending`)
  check('status=pending filter', r.status === 200 && r.json.bookings.every((b) => b.status === 'pending'), r.status)
  r = await admin('GET', `/export/bookings?search=${RUN}&pol=${pol._id}`)
  check('pol filter (by ObjectId)', r.status === 200 && r.json.bookings.every((b) => b.pol?._id === pol._id), r.status)
  r = await admin('GET', '/export/bookings?status[$ne]=cancelled')
  check('operator-injection in status is neutralised (no 500)', r.status === 200, r.status)
  r = await admin('GET', '/export/bookings?search=(')
  check('regex metacharacters in search are escaped (no 500)', r.status === 200, r.status)
  r = await admin('GET', `/export/bookings?pol[$ne]=x`)
  check('operator-injection in pol is neutralised (no 500, filter dropped)', r.status === 200, r.status)

  // ─── 7. Update every section ────────────────────────────────────────────
  const sectionUpdate = {
    ucrNumber: 'UCR-1', exportTaxNumber: 'ETX-1', importTaxNumber: 'ITX-1', importCountry: 'Germany', packagesCount: 12,
    vgm: 1000, grossWeight: 900, cbm: 40, hsCode: '0207.14', packageType: 'Cartons',
    carrier: undefined, vesselName: 'MSC E2E', voyageNo: 'V001', blNo: 'BL-E2E-1',
    spaceConfirmationStatus: 'Confirmed', carrierBookingRef: 'CBR-1', voContactPerson: 'Jane Doe',
    bookingConfirmationStatus: 'Issued',
    nvocc: nvocc._id, currency: 'EUR', price: 500, cost: 300, freeTime: '2026-12-01',
    shipper: { name: 'Shipper Co', email: 'shipper@example.com', phone1: '+201', address: 'Addr S', taxNumber: 'TX-S' },
    consignee: { name: 'Consignee Co', email: 'consignee@example.com', phone1: '+202', address: 'Addr C', taxNumber: 'TX-C' },
    polAgent: { name: 'POL Agent', email: 'pol@example.com', phone: '+203' },
    podAgent: { name: 'POD Agent', email: 'pod@example.com', phone: '+204' },
    manifestStatus: 'SUBMITTED', notes: 'E2E note',
  }
  r = await admin('PUT', `/export/bookings/${bMinimal._id}`, sectionUpdate)
  check('unified update persists fields across every section', r.status === 200
    && r.json.data.ucrNumber === 'UCR-1' && r.json.data.nvocc?._id === nvocc._id && r.json.data.currency === 'EUR'
    && r.json.data.shipper?.name === 'Shipper Co' && r.json.data.polAgent?.name === 'POL Agent'
    && r.json.data.manifestStatus === 'SUBMITTED' && r.json.data.notes === 'E2E note' && r.json.data.blNo === 'BL-E2E-1',
    msg(r))

  // ─── 8. customsSubmitted -> customsSubmittedAt stamped, then cleared ──
  r = await admin('PUT', `/export/bookings/${bMinimal._id}`, { customsSubmitted: true, customsReferenceNo: 'NAFEZA-1' })
  check('customsSubmitted flips true -> customsSubmittedAt is stamped', r.status === 200 && !!r.json.data.customsSubmittedAt, msg(r))
  r = await admin('PUT', `/export/bookings/${bMinimal._id}`, { customsSubmitted: false })
  check('customsSubmitted flips back false -> customsSubmittedAt cleared to null', r.status === 200 && r.json.data.customsSubmittedAt === null, JSON.stringify(r.json?.data?.customsSubmittedAt))

  // ─── 9. File uploads (real signature check, not just mimetype) ────────
  r = await uploadFile('PUT', `/export/bookings/${bMinimal._id}`, {}, { field: 'shippingDeclaration', bytes: PNG_BYTES, mime: 'image/png', name: 'decl.png' })
  check('valid PNG upload accepted (real magic-byte check passes)', r.status === 200 && r.json.data.shippingDeclaration?.fileName === 'decl.png', msg(r))
  r = await uploadFile('PUT', `/export/bookings/${bMinimal._id}`, {}, { field: 'shippingDeclaration', bytes: notAnImage, mime: 'image/png', name: 'fake.png' })
  check('spoofed-mimetype upload rejected by real content check', r.status === 400 && /does not match/i.test(msg(r)), `${r.status} ${msg(r)}`)
  r = await admin('GET', `/export/bookings/${bMinimal._id}/attachment`)
  check('attachment download route serves the uploaded file', r.status === 200, r.status)
  r = await admin('GET', `/export/bookings/${bStockWarning._id}/attachment`)
  check('attachment download on a booking with none -> 404', r.status === 404, r.status)

  // ─── 10. Depot / Confirm / Stock allocation lifecycle ──────────────────
  // Diff before/after at this exact (type, nvocc, depot) triple to capture
  // precisely the unit ids quick-add just created — never assume the triple
  // started empty, a live dev DB may already carry real stock there.
  const stockAt = () => admin('GET', `/master/containers?containerType=${t20._id}&nvocc=${nvocc._id}&depot=${depot._id}`).then((r) => r.json?.data || [])
  const beforeSeedIds = new Set((await stockAt()).map((u) => u._id))
  const seeded = await admin('POST', '/master/containers/quick-add', { containerType: t20._id, nvocc: nvocc._id, depot: depot._id, quantity: 3 })
  check('seed 3 units of 20DC stock at (nvocc, depot)', seeded.status === 201 && seeded.json.data.createdCount === 3, msg(seeded))
  created.containerIds.push(...(await stockAt()).filter((u) => !beforeSeedIds.has(u._id)).map((u) => u._id))

  r1 = await mk('confirm-flow', { containers: [{ containerType: t20._id, quantity: 2 }], nvocc: nvocc._id })
  const bFlow = r1.json.data

  r = await admin('PUT', `/export/bookings/${bFlow._id}/confirm`)
  check('confirm without a depot -> 400', r.status === 400 && /depot/i.test(msg(r)), `${r.status} ${msg(r)}`)

  r = await admin('PUT', `/export/bookings/${bFlow._id}`, { depot: depot._id })
  check('depot set via update', r.status === 200 && r.json.data.depot?._id === depot._id, msg(r))

  // The dev DB may already carry real stock at this (type, nvocc, depot)
  // triple, so the overview's absolute numbers aren't ours to assert on —
  // only the DELTA our own confirm/cancel causes is.
  const overviewRow = async () => (await admin('GET', `/master/containers/overview?containerType=${t20._id}&nvocc=${nvocc._id}&depot=${depot._id}`)).json?.data?.[0]
  const availableBefore = (await overviewRow())?.available

  r = await admin('PUT', `/export/bookings/${bFlow._id}/confirm`)
  check('confirm succeeds once depot is set', r.status === 200 && r.json.data.status === 'confirmed', msg(r))

  let units = (await admin('GET', `/master/containers?booking=${bFlow._id}`)).json?.data || []
  check('exactly 2 units allocated to this booking, stamped Empty Assigned', units.length === 2 && units.every((u) => u.status === 'allocated' && u.containerStatus === 'Empty Assigned'), JSON.stringify(units.map((u) => [u.status, u.containerStatus])))
  const row1 = await overviewRow()
  check('stock overview\'s available count drops by exactly 2 after allocating 2', row1?.available === availableBefore - 2, `before=${availableBefore} after=${row1?.available}`)

  r = await admin('PUT', `/export/bookings/${bFlow._id}/confirm`)
  check('confirming an already-confirmed booking -> 400', r.status === 400 && /confirmed/i.test(msg(r)), `${r.status} ${msg(r)}`)

  r = await admin('DELETE', `/export/bookings/${bFlow._id}`)
  check('deleting a confirmed booking is blocked -> 400', r.status === 400 && /cancel/i.test(msg(r)), `${r.status} ${msg(r)}`)

  // per-unit fulfillment update (booking:update, not masterData:update)
  const unitId = units[0]._id
  r = await admin('PUT', `/master/containers/${unitId}`, { sealNumber: 'SEAL-1', guaranteeReceiptStatus: 'Received', containerStatus: 'Gated-In', vasUploadStatus: 'Uploaded' })
  check('per-unit fulfillment fields update', r.status === 200 && r.json.data.sealNumber === 'SEAL-1' && r.json.data.containerStatus === 'Gated-In', msg(r))

  r = await admin('PUT', `/export/bookings/${bFlow._id}/cancel`)
  check('cancel a confirmed booking succeeds', r.status === 200 && r.json.data.status === 'cancelled', msg(r))

  units = (await admin('GET', `/master/containers?booking=${bFlow._id}`)).json?.data || []
  check('cancel releases exactly those units back to available, booking link cleared', units.length === 0, JSON.stringify(units))
  const row2 = await overviewRow()
  check('stock overview\'s available count is back to the pre-confirm value after cancel', row2?.available === availableBefore, `before=${availableBefore} after=${row2?.available}`)
  const releasedUnit = (await admin('GET', `/master/containers?containerType=${t20._id}&nvocc=${nvocc._id}&depot=${depot._id}`)).json?.data?.find((u) => u._id === unitId)
  check('released unit had its fulfillment fields cleared back to null', releasedUnit && releasedUnit.sealNumber == null && releasedUnit.containerStatus == null, JSON.stringify(releasedUnit))

  r = await admin('PUT', `/export/bookings/${bFlow._id}/cancel`)
  check('cancelling an already-cancelled booking -> 400', r.status === 400 && /already cancelled/i.test(msg(r)), `${r.status} ${msg(r)}`)
  r = await admin('PUT', `/export/bookings/${bFlow._id}`, { notes: 'should be rejected' })
  check('updating a cancelled booking -> 400', r.status === 400 && /cancelled/i.test(msg(r)), `${r.status} ${msg(r)}`)

  // ─── 11. B&L sub-API — field-limited projection, independent save ─────
  r = await admin('GET', `/export/bookings/${bMinimal._id}/bl`)
  const blGet = r.json?.data
  check('GET .../bl includes the context fields', r.status === 200 && blGet?.jobNo === bMinimal.jobNo && blGet?.clientName === bMinimal.clientName && blGet?.pol?._id === pol._id, msg(r))
  check('GET .../bl EXCLUDES price/cost/carrier/containers/depot/manifestStatus/notes', blGet
    && blGet.price === undefined && blGet.cost === undefined && blGet.carrier === undefined
    && blGet.containers === undefined && blGet.depot === undefined && blGet.manifestStatus === undefined && blGet.notes === undefined,
    JSON.stringify(Object.keys(blGet || {})))

  r = await admin('GET', `/export/bookings/bl?search=${RUN}&limit=50`)
  check('GET /bl (list) is field-limited and finds our bookings', r.status === 200 && r.json.bookings.length >= 1 && r.json.bookings.every((b) => b.price === undefined), `${r.status} n=${r.json?.bookings?.length}`)

  const blUpdate = {
    elHarkaRepName: 'Rep Name', exportCustomsDeclarationNo: 'DECL-1', certificateReceivedDate: '2026-10-01',
    hblNumber: 'HBL-1', mblNumber: 'MBL-1', notifyPartyName: 'Notify Co', consigneeToOrder: true,
    blDraftVersion: 'v1', clientConfirmationStatus: 'Confirmed',
    blType: 'Seaway Bill', numberOfOriginalBLs: 3, freightTermsOnBL: 'Freight Collect', placeOfIssue: 'Alexandria',
    finalLoadListStatus: 'Sent', dgManifestRequired: true, dgManifestStatus: 'Sent',
    paymentRequestSent: true, invoiceStatus: 'Issued',
    podAgentUpdateLog: [{ date: '2026-10-02', note: 'first update' }],
    customerNotifiedDate: '2026-10-03',
  }
  r = await admin('PUT', `/export/bookings/${bMinimal._id}/bl`, blUpdate)
  check('PUT .../bl saves every B&L field', r.status === 200
    && r.json.data.hblNumber === 'HBL-1' && r.json.data.mblNumber === 'MBL-1' && r.json.data.consigneeToOrder === true
    && r.json.data.finalLoadListStatus === 'Sent' && r.json.data.podAgentUpdateLog?.[0]?.note === 'first update',
    msg(r))
  const bookingAfterBl = (await admin('GET', `/export/bookings/${bMinimal._id}`)).json?.data
  check('B/L Number (Booking-owned) is untouched by the B&L-only save — a distinct field from HBL/MBL', bookingAfterBl?.blNo === 'BL-E2E-1', bookingAfterBl?.blNo)
  check('Booking-owned price/notes are untouched by the B&L-only save', bookingAfterBl?.price === 500 && bookingAfterBl?.notes === 'E2E note', `${bookingAfterBl?.price} ${bookingAfterBl?.notes}`)

  r = await uploadFile('PUT', `/export/bookings/${bMinimal._id}/bl`, {}, { field: 'customsCertificateFile', bytes: PNG_BYTES, mime: 'image/png', name: 'cert.png' })
  check('customs certificate upload (valid PNG) accepted', r.status === 200 && r.json.data.customsCertificateFile?.fileName === 'cert.png', msg(r))
  r = await uploadFile('PUT', `/export/bookings/${bMinimal._id}/bl`, {}, { field: 'customsCertificateFile', bytes: notAnImage, mime: 'image/png', name: 'fake.png' })
  check('spoofed customs certificate upload rejected', r.status === 400, r.status)
  r = await admin('GET', `/export/bookings/${bMinimal._id}/bl/customs-certificate-file`)
  check('customs certificate download route works', r.status === 200, r.status)

  r = await admin('PUT', `/export/bookings/${bMinimal._id}/bl`, { podAgentUpdateLog: [{ note: 'missing date' }] })
  check('podAgentUpdateLog entry without a date -> 400', r.status === 400, `${r.status} ${msg(r)}`)

  r = await admin('GET', `/export/bookings/${new mongoose.Types.ObjectId()}/bl`)
  check('GET .../bl on a nonexistent id -> 404', r.status === 404, r.status)
  r = await admin('PUT', `/export/bookings/${bFlow._id}/bl`, { hblNumber: 'X' })
  check('PUT .../bl on a cancelled booking -> 400', r.status === 400 && /cancelled/i.test(msg(r)), `${r.status} ${msg(r)}`)

  // ─── 12. Delete lifecycle ────────────────────────────────────────────
  r = await admin('DELETE', `/export/bookings/${bFlow._id}`)
  check('delete succeeds once cancelled', r.status === 200, msg(r))
  r = await admin('GET', `/export/bookings/${bFlow._id}`)
  check('deleted booking now 404s', r.status === 404, r.status)
  created.bookingIds = created.bookingIds.filter((id) => id !== bFlow._id) // already gone, skip in cleanup

  // ─── 13. Preview & Excel export ─────────────────────────────────────
  r = await admin('GET', '/export/bookings/preview')
  check('preview endpoint returns summary + rows', r.status === 200 && r.json.summary?.containerTotals && Array.isArray(r.json.bookings), msg(r))
  r = await admin('GET', '/export/bookings/export-excel')
  const xlsxType = r.headers?.get?.('content-type') || ''
  check('excel export returns an xlsx content-type', r.status === 200 && xlsxType.includes('spreadsheetml'), `${r.status} ${xlsxType}`)

  // ─── 14. Audit log ───────────────────────────────────────────────────
  r = await admin('GET', '/audit-logs?resource=Booking&limit=100')
  const auditForRun = (r.json?.logs || []).filter((l) => created.jobNos.includes(l.resourceId))
  check('audit log recorded CONFIRM, CANCEL and DELETE for our test booking', r.status === 200
    && auditForRun.some((l) => l.action === 'CONFIRM') && auditForRun.some((l) => l.action === 'CANCEL') && auditForRun.some((l) => l.action === 'DELETE'),
    `${r.status} n=${auditForRun.length}`)

  // ─── 15. Independent RBAC — bl:* vs booking:* really are independent ──
  const roleRes1 = await admin('POST', '/roles', { name: `${RUN}-bl-only`.toLowerCase(), permissions: ['bl:read', 'bl:update'], description: 'E2E temp role' })
  const roleRes2 = await admin('POST', '/roles', { name: `${RUN}-booking-only`.toLowerCase(), permissions: ['booking:read', 'booking:update'], description: 'E2E temp role' })
  check('temp roles created', roleRes1.status === 201 && roleRes2.status === 201, `${roleRes1.status} ${roleRes2.status}`)
  if (roleRes1.json?.data?._id) created.roleIds.push(roleRes1.json.data._id)
  if (roleRes2.json?.data?._id) created.roleIds.push(roleRes2.json.data._id)

  // Users are created directly in the DB (same technique this project's own
  // seed.js uses for the bootstrap admin) — the invite-by-email flow can't
  // be driven headlessly since SMTP_HOST is empty in dev (the link is only
  // ever console-logged, never returned by any API response).
  await mongoose.connect(process.env.MONGO_URI)
  db = mongoose.connection.db
  const pass = 'E2ETestPass123!'
  const passwordHash = await hashPassword(pass)
  const blOnlyEmail = `e2e-bl-only-${RUN}@example.com`.toLowerCase()
  const bookingOnlyEmail = `e2e-booking-only-${RUN}@example.com`.toLowerCase()
  const u1 = await db.collection('users').insertOne({ name: 'E2E BL Only', email: blOnlyEmail, passwordHash, role: new mongoose.Types.ObjectId(roleRes1.json.data._id), status: 'active', createdAt: new Date(), updatedAt: new Date() })
  const u2 = await db.collection('users').insertOne({ name: 'E2E Booking Only', email: bookingOnlyEmail, passwordHash, role: new mongoose.Types.ObjectId(roleRes2.json.data._id), status: 'active', createdAt: new Date(), updatedAt: new Date() })
  created.userIds.push(u1.insertedId.toString(), u2.insertedId.toString())

  const blOnly = session()
  r = await blOnly('POST', '/auth/login', { email: blOnlyEmail, password: pass }, { noAuth: true })
  check('bl-only test user logs in', r.status === 200, msg(r))
  r = await blOnly('GET', '/export/bookings')
  check('bl-only user: GET /export/bookings -> 403 (no booking:read)', r.status === 403, `${r.status} ${msg(r)}`)
  r = await blOnly('GET', `/export/bookings/${bMinimal._id}`)
  check('bl-only user: GET full booking -> 403', r.status === 403, r.status)
  r = await blOnly('GET', `/export/bookings/${bMinimal._id}/bl`)
  check('bl-only user: GET .../bl -> 200, field-limited', r.status === 200 && r.json.data.price === undefined, `${r.status} ${msg(r)}`)
  r = await blOnly('PUT', `/export/bookings/${bMinimal._id}/bl`, { placeOfIssue: 'Updated by bl-only user' })
  check('bl-only user: PUT .../bl -> 200', r.status === 200 && r.json.data.placeOfIssue === 'Updated by bl-only user', msg(r))
  r = await blOnly('PUT', `/export/bookings/${bMinimal._id}`, { notes: 'should be forbidden' })
  check('bl-only user: PUT full booking -> 403', r.status === 403, r.status)

  const bookingOnly = session()
  r = await bookingOnly('POST', '/auth/login', { email: bookingOnlyEmail, password: pass }, { noAuth: true })
  check('booking-only test user logs in', r.status === 200, msg(r))
  r = await bookingOnly('GET', `/export/bookings/${bMinimal._id}`)
  check('booking-only user: GET full booking -> 200', r.status === 200, `${r.status} ${msg(r)}`)
  r = await bookingOnly('GET', `/export/bookings/${bMinimal._id}/bl`)
  check('booking-only user: GET .../bl -> 403 (no bl:read)', r.status === 403, r.status)
  r = await bookingOnly('PUT', `/export/bookings/${bMinimal._id}/bl`, { placeOfIssue: 'nope' })
  check('booking-only user: PUT .../bl -> 403', r.status === 403, r.status)
  r = await bookingOnly('GET', '/export/bookings/bl')
  check('booking-only user: GET /bl list -> 403', r.status === 403, r.status)
} catch (err) {
  check('test run completed without an unexpected error', false, err.stack || err.message)
} finally {
  try {
    if (!db) await mongoose.connect(process.env.MONGO_URI)
    db = mongoose.connection.db
    // Release/delete any leftover E2E stock units, delete leftover test
    // bookings, temp users, temp roles.
    const delContainers = created.containerIds.length
      ? await db.collection('containers').deleteMany({ _id: { $in: created.containerIds.map((id) => new mongoose.Types.ObjectId(id)) } })
      : { deletedCount: 0 }
    const bookingObjIds = created.bookingIds.map((id) => new mongoose.Types.ObjectId(id))
    const delBookings = bookingObjIds.length ? await db.collection('bookings').deleteMany({ _id: { $in: bookingObjIds } }) : { deletedCount: 0 }
    const delUsers = created.userIds.length ? await db.collection('users').deleteMany({ _id: { $in: created.userIds.map((id) => new mongoose.Types.ObjectId(id)) } }) : { deletedCount: 0 }
    const delRoles = created.roleIds.length ? await db.collection('roles').deleteMany({ _id: { $in: created.roleIds.map((id) => new mongoose.Types.ObjectId(id)) } }) : { deletedCount: 0 }
    // Give back consumed job-counter sequence numbers, only for ones still
    // at the tail (never risk creating a future duplicate jobNo).
    const year = new Date().getFullYear()
    for (const jobNo of [...created.jobNos].reverse()) {
      const seq = Number(/-(\d+)$/.exec(jobNo)?.[1])
      if (!seq) continue
      const res = await db.collection('jobcounters').updateOne({ _id: `job-${year}`, seq }, { $inc: { seq: -1 } })
      if (!res.modifiedCount) break // once one isn't the tail, none after it (older) can be either
    }
    console.log(`cleanup: removed ${delBookings.deletedCount} booking(s), ${delContainers.deletedCount} container unit(s), ${delUsers.deletedCount} user(s), ${delRoles.deletedCount} role(s)`)
    await mongoose.disconnect()
  } catch (e) { console.log('CLEANUP FAILED — remove E2E-BOOKING- data by hand:', e.message) }
  const failed = results.filter((x) => !x.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed, run=${RUN}`)
  process.exitCode = failed.length ? 1 : 0
}
