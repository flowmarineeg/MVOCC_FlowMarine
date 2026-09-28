// Backend E2E for the Quotation module — drives the real HTTP API (default :5000).
// Run: cd e2e && npm install && npm run quotation:api   (backend must be running)
// Everything it creates is prefixed E2E-<runId> and removed in `finally`.
import { pathToFileURL, fileURLToPath } from 'node:url'

// Repo-relative: e2e/quotation/ -> ../../backend/
const BACKEND = fileURLToPath(new URL('../../backend/', import.meta.url))
const imp = (p) => import(pathToFileURL(BACKEND + p).href)
const { default: dotenv } = await imp('node_modules/dotenv/lib/main.js')
dotenv.config({ path: BACKEND + '.env' })
const { default: mongoose } = await imp('node_modules/mongoose/index.js')

const API = process.env.API || 'http://localhost:5000/api'
const RUN = `E2E-${Date.now().toString(36).toUpperCase()}`
let cookie = ''
const results = []
const created = { quotationIds: [], bookingIds: [], jobNos: [] }

const check = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail: cond ? '' : String(detail) })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + detail}`)
}
const near = (a, b, eps = 0.01) => Math.abs(Number(a) - Number(b)) <= eps

async function call(method, path, body, { form = false, noAuth = false } = {}) {
  const headers = {}
  if (cookie && !noAuth) headers.cookie = cookie
  let payload
  if (form) payload = body
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body) }
  const res = await fetch(API + path, { method, headers, body: payload })
  const sc = res.headers.getSetCookie?.() || []
  if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ')
  let json = null
  try { json = await res.json() } catch { /* empty */ }
  return { status: res.status, json }
}
const msg = (r) => JSON.stringify(r.json?.message || r.json?.errors?.map((e) => e.msg) || r.json)

const line = (rate20, rate40, extra = {}) => ({ ...(rate20 !== undefined && { rate20 }), ...(rate40 !== undefined && { rate40 }), ...extra })

let db
try {
  // ─── 0. Auth ─────────────────────────────────────────────────────────
  let r = await call('GET', '/export/quotations', undefined, { noAuth: true })
  check('unauthenticated GET /quotations -> 401', r.status === 401, r.status)

  r = await call('POST', '/auth/login', { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_DEFAULT_PASSWORD }, { noAuth: true })
  if (r.status !== 200) r = await call('POST', '/auth/login', { email: 'admin@nvocc.local', password: 'ChangeMe123!' }, { noAuth: true })
  check('admin login', r.status === 200, msg(r))
  if (r.status !== 200) throw new Error('cannot log in — aborting')
  check('admin holds quotation permissions', ['quotation:create', 'quotation:read', 'quotation:update', 'quotation:approve'].every((p) => r.json.data?.role?.permissions?.includes(p) || r.json.data?.permissions?.includes(p)), JSON.stringify(Object.keys(r.json.data || {})))

  // ─── master data ─────────────────────────────────────────────────────
  const list = async (p) => (await call('GET', p)).json?.data || []
  const types = await list('/master/container-types')
  const ports = await list('/master/ports')
  const nvoccs = await list('/master/nvoccs')
  const t20 = types.find((t) => t.code === '20DC'), t40 = types.find((t) => t.code === '40HC')
  check('master data available (20DC, 40HC, 2 ports, an NVOCC)', t20 && t40 && ports.length >= 2 && nvoccs.length >= 1, `types=${types.length} ports=${ports.length} nvoccs=${nvoccs.length}`)
  const [pol, pod] = ports
  const nvocc = nvoccs[0]

  const base = (n, extra = {}) => ({
    quotationNo: `${RUN}-${n}`, customerType: 'new', clientName: `E2E Client ${n}`, contactPhone: '+20100000000', contactEmail: 'e2e@example.com',
    salesRep: 'E2E Tester', commodity: 'E2E commodity', pol: pol._id, pod: pod._id, nvocc: nvocc._id, ...extra,
  })
  const mk = async (n, extra) => {
    const res = await call('POST', '/export/quotations', base(n, extra))
    if (res.status === 201) created.quotationIds.push(res.json.data._id)
    return res
  }

  // ─── 1. Create with full rate tables (mixed sizes, qty override, custom line) ──
  // Expected (2×20DC + 1×40HC):
  //  buying origin  : OF 100*2+200*1=400, THC 10*2+20=40, BL 50*1(override)=50, custom Seal 5*2=10  => 500
  //  buying dest    : DTHC 30*2+60=120                                                              => 620
  //  selling origin : OF 200*2+400=800, THC 20*2+40=80, BL 100*1(override)=100                      => 980
  //  selling dest   : DTHC 50*2+100=200, LOLO 20*2=40                                               => 1220
  //  net 600, margin 600/1220 = 49.18 %
  const q1Body = {
    containers: [{ containerType: t20._id, quantity: 2 }, { containerType: t40._id, quantity: 1 }],
    buyingCurrency: 'USD', sellingCurrency: 'USD', exchangeRate: 1,
    buyingOrigin: { oceanFreight: line(100, 200), thc: line(10, 20), bl: { rate20: 50, qty20: 1 }, custom: [{ label: 'Seal', rate20: 5 }] },
    buyingDestination: { dthc: line(30, 60) },
    sellingOrigin: { oceanFreight: line(200, 400), thc: line(20, 40), bl: { rate20: 100, qty20: 1 } },
    sellingDestination: { dthc: line(50, 100), lolo: { rate20: 20 } },
    totalBuyingCost: 999999, totalSellingPrice: 999999, netProfit: 999999, belowMinMargin: true, // must be ignored
  }
  r = await mk('1', q1Body)
  check('create quotation with rate tables -> 201', r.status === 201, msg(r))
  const q1 = r.json?.data
  check('server total buying = 620 (client value ignored)', near(q1?.totalBuyingCost, 620), q1?.totalBuyingCost)
  check('server total selling = 1220', near(q1?.totalSellingPrice, 1220), q1?.totalSellingPrice)
  check('net profit = 600 / margin = 49.18%', near(q1?.netProfit, 600) && near(q1?.profitMarginPercent, 49.18), `${q1?.netProfit} ${q1?.profitMarginPercent}`)
  check('belowMinMargin=false (client "true" ignored)', q1?.belowMinMargin === false, q1?.belowMinMargin)

  r = await call('GET', `/export/quotations/${q1._id}`)
  const g = r.json?.data
  check('GET round-trips tables (rates, qty override, custom line)',
    g?.buyingOrigin?.oceanFreight?.rate20 === 100 && g?.buyingOrigin?.oceanFreight?.rate40 === 200 &&
    g?.buyingOrigin?.bl?.qty20 === 1 && g?.buyingOrigin?.custom?.[0]?.label === 'Seal' &&
    g?.sellingDestination?.lolo?.rate20 === 20 && g?.buyingDestination?.dthc?.rate40 === 60, JSON.stringify(g?.buyingOrigin))
  check('legacy fields are gone from the response', g && !('oceanFreightBuying' in g) && !('buyingCharges' in g))

  // ─── 2. 40ft rates ignored when no 40ft container is selected ────────
  r = await mk('2', {
    containers: [{ containerType: t20._id, quantity: 3 }],
    buyingOrigin: { oceanFreight: line(100, 999) }, sellingOrigin: { oceanFreight: line(200, 999) },
  })
  const q2 = r.json?.data
  check('20ft-only quote: 40ft rate not counted (buy 300 / sell 600)', r.status === 201 && near(q2?.totalBuyingCost, 300) && near(q2?.totalSellingPrice, 600), `${r.status} ${q2?.totalBuyingCost}/${q2?.totalSellingPrice} ${msg(r)}`)

  // ─── 3. Destination in another currency ──────────────────────────────
  r = await mk('3', {
    containers: [{ containerType: t20._id, quantity: 2 }],
    buyingCurrency: 'USD', buyingOrigin: { oceanFreight: line(100) },
    buyingDestinationCurrency: 'EUR', buyingDestinationRate: 1.1, buyingDestination: { dthc: line(100) },
    sellingCurrency: 'USD', sellingOrigin: { oceanFreight: line(300) },
  })
  const q3 = r.json?.data
  check('EUR destination converted at 1.1 (buy 200 + 220 = 420)', r.status === 201 && near(q3?.totalBuyingCost, 420), `${r.status} ${q3?.totalBuyingCost} ${msg(r)}`)
  check('selling 600, net 600-420=180', near(q3?.totalSellingPrice, 600) && near(q3?.netProfit, 180), `${q3?.totalSellingPrice} ${q3?.netProfit}`)

  r = await call('POST', '/export/quotations', base('3b', {
    containers: [{ containerType: t20._id, quantity: 1 }],
    buyingCurrency: 'USD', buyingDestinationCurrency: 'EUR', buyingDestination: { dthc: line(100) },
  }))
  check('differing destination currency without a rate -> 400 with clear message', r.status === 400 && /exchange rate/i.test(msg(r)), `${r.status} ${msg(r)}`)
  r = await call('POST', '/export/quotations', base('3c', {
    containers: [{ containerType: t20._id, quantity: 1 }],
    sellingCurrency: 'USD', sellingDestinationCurrency: 'EGP', sellingDestinationRate: 0,
  }))
  check('selling destination currency differs + rate 0 -> 400', r.status === 400, `${r.status} ${msg(r)}`)

  // ─── 4. Below minimum margin ─────────────────────────────────────────
  r = await mk('4', {
    containers: [{ containerType: t20._id, quantity: 1 }],
    buyingOrigin: { oceanFreight: line(100) }, sellingOrigin: { oceanFreight: line(105) },
  })
  const q4 = r.json?.data
  check('margin 4.76% -> belowMinMargin=true', r.status === 201 && q4?.belowMinMargin === true && near(q4?.profitMarginPercent, 4.76), `${q4?.profitMarginPercent} ${q4?.belowMinMargin}`)

  // ─── 5. Validation ───────────────────────────────────────────────────
  const bad = async (name, extra, re) => {
    const res = await call('POST', '/export/quotations', base(`bad-${name}`, { containers: [{ containerType: t20._id, quantity: 1 }], ...extra }))
    check(`validation: ${name} -> 400`, res.status === 400 && (!re || re.test(msg(res))), `${res.status} ${msg(res)}`)
  }
  await bad('negative rate', { buyingOrigin: { thc: { rate20: -5 } } }, /positive/i)
  await bad('negative qty override', { sellingDestination: { cic: { qty20: -1 } } }, /positive/i)
  await bad('non-numeric rate', { buyingOrigin: { bl: { rate20: 'abc' } } }, /positive/i)
  await bad('custom line without label', { buyingOrigin: { custom: [{ label: '', rate20: 5 }] } }, /label/i)
  await bad('table is not an object', { buyingOrigin: 'oops' }, /object/i)
  await bad('no containers', { containers: [] }, /container/i)
  await bad('duplicate container type', { containers: [{ containerType: t20._id, quantity: 1 }, { containerType: t20._id, quantity: 2 }] }, /once/i)
  await bad('nonexistent container type', { containers: [{ containerType: new mongoose.Types.ObjectId().toString(), quantity: 1 }] }, /do not exist/i)
  await bad('missing commodity', { commodity: '' }, /commodity/i)
  r = await call('POST', '/export/quotations', { ...base('dupno'), containers: [{ containerType: t20._id, quantity: 1 }], quotationNo: q1.quotationNo })
  check('duplicate quotationNo rejected (409/400)', [400, 409].includes(r.status), `${r.status} ${msg(r)}`)

  // ─── 6. Update recomputes totals ─────────────────────────────────────
  r = await call('PUT', `/export/quotations/${q1._id}`, { sellingOrigin: { ...q1Body.sellingOrigin, oceanFreight: line(250, 400) } })
  check('update selling OF 200->250: selling 1320, net 700', r.status === 200 && near(r.json.data.totalSellingPrice, 1320) && near(r.json.data.netProfit, 700), `${r.status} ${r.json?.data?.totalSellingPrice} ${msg(r)}`)
  r = await call('PUT', `/export/quotations/${q1._id}`, { containers: [{ containerType: t20._id, quantity: 2 }] })
  check('dropping the 40HC container drops all 40ft pricing (buy 200+20+50+10+60 = 340)',
    r.status === 200 && near(r.json.data.totalBuyingCost, 340), `${r.status} buy=${r.json?.data?.totalBuyingCost} sell=${r.json?.data?.totalSellingPrice}`)
  check('  ...selling = 250*2+40+100+100+40 = 780', near(r.json?.data?.totalSellingPrice, 780), r.json?.data?.totalSellingPrice)
  r = await call('PUT', `/export/quotations/${q1._id}`, { buyingCurrency: 'USD', buyingDestinationCurrency: 'GBP' })
  check('update: switching destination currency without a rate -> 400', r.status === 400, `${r.status} ${msg(r)}`)
  // restore 40HC so later steps use the original shape
  r = await call('PUT', `/export/quotations/${q1._id}`, { containers: [{ containerType: t20._id, quantity: 2 }, { containerType: t40._id, quantity: 1 }] })
  check('restoring the 40HC container re-includes the 40ft prices', r.status === 200 && near(r.json.data.totalBuyingCost, 620), `${r.json?.data?.totalBuyingCost}`)

  // ─── 7. suggest-rate ─────────────────────────────────────────────────
  r = await call('GET', `/export/quotations/suggest-rate?nvocc=${nvocc._id}&excludeId=${q4._id}`)
  check('suggest-rate returns the most recent OTHER quotation (E2E-3) with new-shape tables',
    r.status === 200 && r.json?.data?.quotationNo === q3.quotationNo && r.json.data.buyingOrigin?.oceanFreight?.rate20 === 100 && r.json.data.buyingDestinationCurrency === 'EUR',
    `${r.status} ${r.json?.data?.quotationNo}`)
  r = await call('GET', '/export/quotations/suggest-rate?nvocc=not-an-id')
  check('suggest-rate with invalid id -> null, no crash', r.status === 200 && r.json?.data === null, `${r.status}`)

  // ─── 8. List / filters ───────────────────────────────────────────────
  r = await call('GET', `/export/quotations?search=${RUN}&limit=50`)
  check('search by quotationNo prefix finds all created quotes', r.status === 200 && r.json.quotations.length >= 4 && r.json.quotations.every((q) => q.quotationNo.startsWith(RUN)), `${r.status} n=${r.json?.quotations?.length}`)
  r = await call('GET', `/export/quotations?search=${RUN}&status=draft`)
  check('status=draft filter', r.status === 200 && r.json.quotations.every((q) => q.status === 'draft'), r.status)
  r = await call('GET', '/export/quotations?status[$ne]=cancelled')
  check('operator-injection in status is neutralised (no 500)', r.status === 200, r.status)
  r = await call('GET', '/export/quotations?search=(')
  check('regex metacharacters in search are escaped (no 500)', r.status === 200, r.status)

  // ─── 9. Status machine ───────────────────────────────────────────────
  r = await call('PUT', `/export/quotations/${q1._id}/status`, { status: 'approved' })
  check('draft -> approved blocked (400)', r.status === 400, `${r.status} ${msg(r)}`)
  r = await call('PUT', `/export/quotations/${q1._id}/status`, { status: 'bogus' })
  check('unknown status -> 400', r.status === 400, r.status)
  r = await call('PUT', `/export/quotations/${q1._id}/status`, { status: 'sent' })
  check('draft -> sent', r.status === 200 && r.json.data.status === 'sent', msg(r))
  r = await call('PUT', `/export/quotations/${q1._id}`, { specialNotes: 'edited while sent' })
  check('edit while SENT allowed for admin (quotation:approve override)', r.status === 200 && r.json.data.specialNotes === 'edited while sent', `${r.status} ${msg(r)}`)
  r = await call('PUT', `/export/quotations/${q1._id}/status`, { status: 'negotiation' })
  check('sent -> negotiation', r.status === 200, msg(r))
  r = await call('PUT', `/export/quotations/${q1._id}/status`, { status: 'sent' })
  check('negotiation -> sent', r.status === 200, msg(r))
  r = await call('PUT', `/export/quotations/${q1._id}/status`, { status: 'approved' })
  check('sent -> approved (margin ok)', r.status === 200 && r.json.data.status === 'approved' && r.json.data.approvedBy, msg(r))
  r = await call('PUT', `/export/quotations/${q1._id}/status`, { status: 'sent' })
  check('approved is terminal', r.status === 400, r.status)

  await call('PUT', `/export/quotations/${q2._id}/status`, { status: 'sent' })
  r = await call('PUT', `/export/quotations/${q2._id}/status`, { status: 'rejected' })
  check('reject without reason -> 400', r.status === 400 && /reason/i.test(msg(r)), `${r.status} ${msg(r)}`)
  r = await call('PUT', `/export/quotations/${q2._id}/status`, { status: 'rejected', rejectionReason: 'E2E: price too high' })
  check('reject with reason', r.status === 200 && r.json.data.rejectionReason === 'E2E: price too high', msg(r))
  r = await call('GET', `/export/quotations?search=${q2.quotationNo}&status=rejected`)
  check('rejected quotation stays listed/filterable', r.json?.quotations?.length === 1, r.json?.quotations?.length)

  await call('PUT', `/export/quotations/${q4._id}/status`, { status: 'sent' })
  r = await call('PUT', `/export/quotations/${q4._id}/status`, { status: 'approved' })
  check('below-margin approval allowed for holder of quotation:approve', r.status === 200, `${r.status} ${msg(r)}`)

  // ─── 10. Convert to Job (booking create with quotation link) ─────────
  const bookingForm = (qid) => {
    const f = new FormData()
    f.set('quotation', qid); f.set('clientName', 'E2E Client 1'); f.set('clientPhone', '+20100000000'); f.set('clientEmail', 'e2e@example.com')
    f.set('containers', JSON.stringify([{ containerType: t20._id, quantity: 2 }, { containerType: t40._id, quantity: 1 }]))
    f.set('pol', pol._id); f.set('pod', pod._id); f.set('commodity', 'E2E commodity'); f.set('nvocc', nvocc._id)
    f.set('price', String(q1.totalSellingPrice)); f.set('cost', String(q1.totalBuyingCost))
    return f
  }
  r = await call('POST', '/export/bookings', bookingForm(q3._id), { form: true })
  check('convert a NON-approved quotation -> 400 (no booking created)', r.status === 400, `${r.status} ${msg(r)}`)
  const before = (await call('GET', '/export/bookings?limit=1')).json?.total
  r = await call('POST', '/export/bookings', bookingForm(q1._id), { form: true })
  check('convert approved quotation -> booking 201', r.status === 201 && r.json.data.jobNo, `${r.status} ${msg(r)}`)
  if (r.status === 201) { created.bookingIds.push(r.json.data._id); created.jobNos.push(r.json.data.jobNo) }
  check('booking carries the quotation link', String(r.json?.data?.quotation?._id || r.json?.data?.quotation) === q1._id, JSON.stringify(r.json?.data?.quotation))
  r = await call('GET', `/export/quotations/${q1._id}`)
  check('quotation now has linkedBooking + convertedAt', !!r.json?.data?.linkedBooking?.jobNo && !!r.json?.data?.convertedAt, JSON.stringify(r.json?.data?.linkedBooking))
  const mid = (await call('GET', '/export/bookings?limit=1')).json?.total
  r = await call('POST', '/export/bookings', bookingForm(q1._id), { form: true })
  const after = (await call('GET', '/export/bookings?limit=1')).json?.total
  check('second convert -> 409', r.status === 409, `${r.status} ${msg(r)}`)
  check('second convert left no orphan booking', mid === after && mid === before + 1, `before=${before} mid=${mid} after=${after}`)

  // ─── 11. Audit trail ─────────────────────────────────────────────────
  r = await call('GET', `/audit-logs?resource=Quotation&limit=50`)
  const mine = (r.json?.logs || []).filter((l) => String(l.resourceId || '').startsWith(RUN))
  check('audit log records status changes for E2E quotations', r.status === 200 && mine.some((l) => l.action === 'SENT') && mine.some((l) => l.action === 'APPROVED') && mine.some((l) => l.action === 'REJECTED'), `${r.status} n=${mine.length}`)
} catch (err) {
  check('test run completed without an unexpected error', false, err.stack || err.message)
} finally {
  // ─── cleanup — only documents this run created ──────────────────────
  try {
    await mongoose.connect(process.env.MONGO_URI)
    const dbh = mongoose.connection.db
    const delQ = await dbh.collection('quotations').deleteMany({ quotationNo: { $regex: `^${RUN}` } })
    const ids = created.bookingIds.map((i) => new mongoose.Types.ObjectId(i))
    const delB = ids.length ? await dbh.collection('bookings').deleteMany({ _id: { $in: ids } }) : { deletedCount: 0 }
    // Give the consumed job number back ONLY if ours is still the latest one —
    // if anyone created a job meanwhile, decrementing would risk a duplicate.
    for (const jobNo of created.jobNos) {
      const seq = Number(/-(\d+)$/.exec(jobNo)?.[1])
      const year = new Date().getFullYear()
      const res = await dbh.collection('jobcounters').updateOne({ _id: `job-${year}`, seq }, { $inc: { seq: -1 } })
      console.log(`job counter ${jobNo}: ${res.modifiedCount ? 'restored' : 'left as-is (not the latest)'}`)
    }
    console.log(`cleanup: removed ${delQ.deletedCount} quotation(s), ${delB.deletedCount} booking(s)`)
    await mongoose.disconnect()
  } catch (e) { console.log('CLEANUP FAILED — remove E2E- data by hand:', e.message) }
  const failed = results.filter((x) => !x.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed, run=${RUN}`)
  process.exitCode = failed.length ? 1 : 0
}
