// Backend E2E for the Quotation module — drives the real HTTP API (default :5000).
// Run: cd e2e && npm install && npm run quotation:api   (backend must be running)
// Everything it creates is prefixed E2E-<runId> and removed in `finally`.
import { pathToFileURL, fileURLToPath } from 'node:url'
import { unlink } from 'node:fs/promises'

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
const created = { quotationIds: [], quotationNos: [], bookingIds: [], jobNos: [] }

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

const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
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

  // A real client + contact person + payment terms so quotations built here are READY (send / approve / convert are gated on that)
  const custRes = await call('POST', '/master/customers', { name: `${RUN} Client`, phone: '+20100000000', email: 'e2e@example.com' })
  const clientId = custRes.json?.data?._id
  const base = (n, extra = {}) => ({
    customerType: 'existing', customer: clientId, clientName: `${RUN} Client`, contactPerson: 'E2E Contact', paymentTerms: 'Freight Prepaid', contactPhone: '+20100000000', contactEmail: 'e2e@example.com',
    salesRep: 'E2E Tester', commodity: 'E2E commodity', pol: pol._id, pod: pod._id, nvocc: nvocc._id,
    // PRD Step 0 mandatory fields (Sprint 006): validity, incoterm, totals, client free time
    validityDate: daysFromNow(30), incoterms: 'FOB', grossWeight: 1000, cbm: 10, freeTimeBuyingDays: 14, ...extra,
  })
  const mk = async (n, extra) => {
    const res = await call('POST', '/export/quotations', base(n, extra))
    if (res.status === 201) { created.quotationIds.push(res.json.data._id); created.quotationNos.push(res.json.data.quotationNo) }
    return res
  }

  const mk6 = (n, extra) => mk(n, { containers: [{ containerType: t20._id, quantity: 1 }], ...extra })

  // ─── 1. Create with full rate tables (mixed sizes, qty override, custom line) ──
  // Expected (2×20DC + 1×40HC):
  //  buying origin  : OF 100*2+200*1=400, THC 10*2+20=40, BL 50*1(override)=50, custom Seal 5*2=10  => 500
  //  buying dest    : DTHC 30*2+60=120                                                              => 620
  //  selling origin : OF 200*2+400=800, THC 20*2+40=80, BL 100*1(override)=100                      => 980
  //  selling dest   : DTHC 50*2+100=200, LOLO 20*2=40                                               => 1220
  //  net 600, margin 600/1220 = 49.18 %
  const q1Body = {
    containers: [{ containerType: t20._id, quantity: 2 }, { containerType: t40._id, quantity: 1 }],
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
  check('lines without a currency default to USD -> one USD profit row (1220 / 620 / 600)',
    q1?.totalsCurrency === 'USD' && q1?.totalsByCurrency?.length === 1 && q1.totalsByCurrency[0].currency === 'USD' &&
    near(q1.totalsByCurrency[0].selling, 1220) && near(q1.totalsByCurrency[0].buying, 620) && near(q1.totalsByCurrency[0].netProfit, 600), JSON.stringify(q1?.totalsByCurrency))

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

  // ─── 3. Per-row currency: totals are grouped per currency, never converted ──
  //  buying : OF 100*2 = 200 USD (origin) + DTHC 100*2 = 200 EUR (destination row in EUR)
  //  selling: OF 300*2 = 600 USD
  //  USD: 600 - 200 = +400 (66.67 %)   EUR: 0 - 200 = -200 (0 %, below margin)
  r = await mk('3', {
    containers: [{ containerType: t20._id, quantity: 2 }],
    buyingOrigin: { oceanFreight: { ...line(100), currency: 'USD' } },
    buyingDestination: { dthc: { ...line(100), currency: 'EUR' } },
    sellingOrigin: { oceanFreight: { ...line(300), currency: 'USD' } },
  })
  const q3 = r.json?.data
  const usd = q3?.totalsByCurrency?.find((x) => x.currency === 'USD')
  const eur = q3?.totalsByCurrency?.find((x) => x.currency === 'EUR')
  check('mixed currencies -> one profit row per currency', r.status === 201 && q3?.totalsByCurrency?.length === 2 && !!usd && !!eur, `${r.status} ${JSON.stringify(q3?.totalsByCurrency)} ${msg(r)}`)
  check('USD row: buy 200 / sell 600 / net 400 / 66.67 %', near(usd?.buying, 200) && near(usd?.selling, 600) && near(usd?.netProfit, 400) && near(usd?.marginPercent, 66.67), JSON.stringify(usd))
  check('EUR row: buy 200 / sell 0 / net -200, no conversion into USD', near(eur?.buying, 200) && near(eur?.selling, 0) && near(eur?.netProfit, -200), JSON.stringify(eur))
  check('primary currency = USD (largest selling): scalars are USD buy 200 / sell 600 / net 400', q3?.totalsCurrency === 'USD' && near(q3?.totalBuyingCost, 200) && near(q3?.totalSellingPrice, 600) && near(q3?.netProfit, 400), `${q3?.totalsCurrency} ${q3?.totalBuyingCost}/${q3?.totalSellingPrice}/${q3?.netProfit}`)
  check('any currency under the minimum margin raises belowMinMargin', q3?.belowMinMargin === true, q3?.belowMinMargin)
  check('the row currency is stored on the line', q3?.buyingDestination?.dthc?.currency === 'EUR', JSON.stringify(q3?.buyingDestination))

  // an unselected (blank) currency is its own group, not silently USD
  r = await mk('3z', { nvocc: undefined, containers: [{ containerType: t20._id, quantity: 1 }], buyingOrigin: { oceanFreight: { ...line(10), currency: '' } } })
  check('blank row currency -> its own "no currency" group', r.status === 201 && r.json.data.totalsByCurrency?.length === 1 && r.json.data.totalsByCurrency[0].currency === '' && near(r.json.data.totalsByCurrency[0].buying, 10), msg(r))

  // custom row: uid + currency round-trip
  r = await mk('3c', { nvocc: undefined, containers: [{ containerType: t20._id, quantity: 2 }], buyingOrigin: { custom: [{ uid: 'abc123', label: 'Seal', rate20: 5, currency: 'EGP' }] } })
  check('custom row keeps its uid + currency; totals land in EGP', r.status === 201 && r.json.data.buyingOrigin.custom[0].uid === 'abc123' && r.json.data.buyingOrigin.custom[0].currency === 'EGP' && near(r.json.data.totalsByCurrency?.[0]?.buying, 10) && r.json.data.totalsByCurrency?.[0]?.currency === 'EGP', msg(r))

  // removed (hidden) standard rows: validated, persisted, and excluded from totals
  r = await call('POST', '/export/quotations', base('3h', { containers: [{ containerType: t20._id, quantity: 1 }], buyingOrigin: { hidden: ['notARealLine'] } }))
  check('hiding an unknown standard line -> 400', r.status === 400 && /Unknown charge line/i.test(msg(r)), `${r.status} ${msg(r)}`)
  r = await mk('3i', { nvocc: undefined, containers: [{ containerType: t20._id, quantity: 1 }], sellingOrigin: { oceanFreight: line(100), thc: line(40), hidden: ['thc'] } })
  check('a removed standard row is persisted and its stale values are not counted (sell 100, not 140)',
    r.status === 201 && r.json.data.sellingOrigin.hidden.includes('thc') && near(r.json.data.totalSellingPrice, 100), `${r.status} ${r.json?.data?.totalSellingPrice} ${msg(r)}`)
  r = await mk('3j', { nvocc: undefined, containers: [{ containerType: t20._id, quantity: 1 }], sellingDestination: { cic: line(50), cmc: line(50), dthc: line(10) } })
  check('CIC / CMC rows no longer exist (ignored, not counted: sell 10)', r.status === 201 && r.json.data.sellingDestination.cic === undefined && near(r.json.data.totalSellingPrice, 10), `${r.status} ${r.json?.data?.totalSellingPrice} ${msg(r)}`)

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
  await bad('negative qty override', { sellingDestination: { dthc: { qty20: -1 } } }, /positive/i)
  await bad('non-numeric rate', { buyingOrigin: { bl: { rate20: 'abc' } } }, /positive/i)
  await bad('custom line without label', { buyingOrigin: { custom: [{ label: '', rate20: 5 }] } }, /label/i)
  await bad('table is not an object', { buyingOrigin: 'oops' }, /object/i)
  await bad('no containers', { containers: [] }, /container/i)
  await bad('duplicate container type', { containers: [{ containerType: t20._id, quantity: 1 }, { containerType: t20._id, quantity: 2 }] }, /once/i)
  await bad('nonexistent container type', { containers: [{ containerType: new mongoose.Types.ObjectId().toString(), quantity: 1 }] }, /do not exist/i)
  await bad('missing commodity', { commodity: '' }, /commodity/i)
  // ─── auto quotation number, new fields, removed fields ──────────────
  const yy = String(new Date().getFullYear()).slice(-2)
  const seqOf = (no) => Number(/(\d{4})$/.exec(no || '')?.[1])
  check('quotationNo auto-generated as FQ + YY + 4 digits (FQ26xxxx)', new RegExp(`^FQ${yy}\\d{4}$`).test(q1.quotationNo || ''), q1.quotationNo)
  check('quotation numbers increase in creation order', seqOf(q2.quotationNo) > seqOf(q1.quotationNo) && seqOf(q4.quotationNo) > seqOf(q3.quotationNo), `${q1.quotationNo} ${q2.quotationNo} ${q3.quotationNo} ${q4.quotationNo}`)
  r = await mk('hack', { nvocc: undefined, quotationNo: 'HACK-1', containers: [{ containerType: t20._id, quantity: 1 }] })
  check('a client-supplied quotationNo is ignored', r.status === 201 && /^FQ\d{6}$/.test(r.json.data.quotationNo), msg(r))
  r = await mk('newfields', { nvocc: undefined, containers: [{ containerType: t20._id, quantity: 1 }], targetRate: 1250.5, cargoReadinessDate: '2026-11-01' })
  const qNew = r.json?.data
  check('targetRate + cargoReadinessDate saved', r.status === 201 && qNew?.targetRate === 1250.5 && String(qNew?.cargoReadinessDate).startsWith('2026-11-01'), msg(r))
  r = await call('PUT', `/export/quotations/${qNew._id}`, { targetRate: null, cargoReadinessDate: null })
  check('targetRate + cargoReadinessDate can be cleared on edit', r.status === 200 && !r.json.data.targetRate && !r.json.data.cargoReadinessDate, msg(r))
  r = await call('POST', '/export/quotations', { ...base('badtr'), containers: [{ containerType: t20._id, quantity: 1 }], targetRate: -5 })
  check('negative targetRate -> 400', r.status === 400, r.status)
  r = await mk('dg', { nvocc: undefined, containers: [{ containerType: t20._id, quantity: 1 }], isDangerous: true, unNumber: 'UN1203' })
  check('dangerous goods needs only a UN Number (no UN Class) -> 201', r.status === 201 && r.json.data.unNumber === 'UN1203', msg(r))
  r = await call('POST', '/export/quotations', { ...base('dg2'), containers: [{ containerType: t20._id, quantity: 1 }], isDangerous: true })
  check('dangerous goods without a UN Number -> 400', r.status === 400 && /UN Number/i.test(msg(r)), msg(r))
  r = await mk('removed', { nvocc: undefined, containers: [{ containerType: t20._id, quantity: 1 }], unClass: '3', por: pol._id, fpd: pod._id })
  check('removed fields (unClass / por / fpd) are no longer stored', r.status === 201 && r.json.data.unClass === undefined && r.json.data.por === undefined && r.json.data.fpd === undefined, msg(r))

  // ─── 6. Update recomputes totals ─────────────────────────────────────
  r = await call('PUT', `/export/quotations/${q1._id}`, { sellingOrigin: { ...q1Body.sellingOrigin, oceanFreight: line(250, 400) } })
  check('update selling OF 200->250: selling 1320, net 700', r.status === 200 && near(r.json.data.totalSellingPrice, 1320) && near(r.json.data.netProfit, 700), `${r.status} ${r.json?.data?.totalSellingPrice} ${msg(r)}`)
  r = await call('PUT', `/export/quotations/${q1._id}`, { containers: [{ containerType: t20._id, quantity: 2 }] })
  check('dropping the 40HC container drops all 40ft pricing (buy 200+20+50+10+60 = 340)',
    r.status === 200 && near(r.json.data.totalBuyingCost, 340), `${r.status} buy=${r.json?.data?.totalBuyingCost} sell=${r.json?.data?.totalSellingPrice}`)
  check('  ...selling = 250*2+40+100+100+40 = 780', near(r.json?.data?.totalSellingPrice, 780), r.json?.data?.totalSellingPrice)
  // restore 40HC so later steps use the original shape
  r = await call('PUT', `/export/quotations/${q1._id}`, { containers: [{ containerType: t20._id, quantity: 2 }, { containerType: t40._id, quantity: 1 }] })
  check('restoring the 40HC container re-includes the 40ft prices', r.status === 200 && near(r.json.data.totalBuyingCost, 620), `${r.json?.data?.totalBuyingCost}`)

  // ─── 7. suggest-rate ─────────────────────────────────────────────────
  r = await call('GET', `/export/quotations/suggest-rate?nvocc=${nvocc._id}&excludeId=${q4._id}`)
  check('suggest-rate returns the most recent OTHER quotation (E2E-3) with new-shape tables',
    r.status === 200 && r.json?.data?.quotationNo === q3.quotationNo && r.json.data.buyingOrigin?.oceanFreight?.rate20 === 100 && r.json.data.buyingDestination?.dthc?.currency === 'EUR',
    `${r.status} ${r.json?.data?.quotationNo}`)
  r = await call('GET', '/export/quotations/suggest-rate?nvocc=not-an-id')
  check('suggest-rate with invalid id -> null, no crash', r.status === 200 && r.json?.data === null, `${r.status}`)

  // ─── 8. List / filters ───────────────────────────────────────────────
  r = await call('GET', `/export/quotations?search=${RUN}&limit=50`)
  check('search by client name finds all created quotes', r.status === 200 && r.json.quotations.length >= 4 && r.json.quotations.every((q) => q.clientName.startsWith(RUN)), `${r.status} n=${r.json?.quotations?.length}`)
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

  // ─── 9b. Readiness: required data before send / approve / convert ───
  r = await mk('incomplete', { containers: [{ containerType: t20._id, quantity: 1 }], customer: undefined, contactPerson: '', contactEmail: '', paymentTerms: undefined, nvocc: undefined })
  const incId = r.json?.data?._id
  check('an incomplete DRAFT can still be saved, and reports what is missing',
    r.status === 201 && Array.isArray(r.json.data.readinessIssues) && r.json.data.readinessIssues.length >= 5, msg(r))
  const missing = (r.json?.data?.readinessIssues || []).join(' | ')
  check('readiness lists client, contact email, carrier, pricing and payment terms',
    /select the client/.test(missing) && /contact email/.test(missing) && /select the carrier/.test(missing) && /price at least one buying/.test(missing) && /payment terms/.test(missing), missing)
  r = await call('PUT', `/export/quotations/${incId}/status`, { status: 'sent' })
  check('SEND is blocked while incomplete (400, message names the missing items)', r.status === 400 && /not ready to be sent/.test(msg(r)) && /contact email/.test(msg(r)), `${r.status} ${msg(r)}`)
  r = await call('GET', `/export/quotations/${incId}`)
  check('...and the quotation stayed a draft', r.json.data.status === 'draft')

  // fill it in with TWO separate partial saves (sections 1-4 data, then sections 5-8 data)
  r = await call('PUT', `/export/quotations/${incId}`, { customer: clientId, contactEmail: 'e2e@example.com', inquiryDate: '2026-10-01' })
  check('partial save of the request part only touches its own fields', r.status === 200 && r.json.data.contactEmail === 'e2e@example.com' && !r.json.data.nvocc && r.json.data.readinessIssues.some((i) => /carrier/i.test(i)), msg(r))
  r = await call('PUT', `/export/quotations/${incId}`, { nvocc: nvocc._id, paymentTerms: 'Freight Collect', buyingOrigin: { oceanFreight: line(100, 200) }, sellingOrigin: { oceanFreight: line(150, 300) } })
  check('partial save of the pricing part leaves the request part untouched, and clears the issues',
    r.status === 200 && r.json.data.contactEmail === 'e2e@example.com' && r.json.data.clientName && r.json.data.readinessIssues.length === 0, `${msg(r)} ${JSON.stringify(r.json?.data?.readinessIssues)}`)
  r = await call('PUT', `/export/quotations/${incId}`, { rateValidFrom: '2026-12-01', rateValidTo: '2026-11-01' })
  check('rate valid-to before valid-from -> 400', r.status === 400, `${r.status} ${msg(r)}`)
  r = await call('PUT', `/export/quotations/${incId}/status`, { status: 'sent' })
  check('SEND succeeds once complete', r.status === 200 && r.json.data.status === 'sent', msg(r))

  // approving re-checks readiness (an override-holder can still edit a sent quotation)
  r = await call('PUT', `/export/quotations/${incId}`, { contactPhone: '' })
  r = await call('PUT', `/export/quotations/${incId}/status`, { status: 'approved' })
  check('APPROVE is blocked when required data was removed after sending', r.status === 400 && /not ready to be approved/.test(msg(r)) && /contact phone/.test(msg(r)), `${r.status} ${msg(r)}`)
  await call('PUT', `/export/quotations/${incId}`, { contactPhone: '+20100000000' })
  r = await call('PUT', `/export/quotations/${incId}/status`, { status: 'approved' })
  check('APPROVE succeeds again once fixed', r.status === 200 && r.json.data.status === 'approved', msg(r))

  // convert gate: break an approved quotation, then try to file the booking job
  await call('PUT', `/export/quotations/${incId}`, { contactEmail: '' })
  const convForm = new FormData()
  convForm.set('quotation', incId); convForm.set('clientName', 'E2E Client'); convForm.set('clientPhone', '+20100000000'); convForm.set('clientEmail', 'e2e@example.com')
  convForm.set('containers', JSON.stringify([{ containerType: t20._id, quantity: 1 }]))
  convForm.set('pol', pol._id); convForm.set('pod', pod._id); convForm.set('commodity', 'E2E commodity')
  const bookingsBefore = (await call('GET', '/export/bookings?limit=1')).json?.total
  r = await call('POST', '/export/bookings', convForm, { form: true })
  check('CONVERT to a booking job is blocked while the quotation is incomplete (400, no booking created)',
    r.status === 400 && /not ready to be converted/.test(msg(r)) && (await call('GET', '/export/bookings?limit=1')).json?.total === bookingsBefore, `${r.status} ${msg(r)}`)

  // dangerous goods need UN number + MSDS before send
  r = await mk('dg-ready', { isDangerous: true, unNumber: 'UN1203', containers: [{ containerType: t20._id, quantity: 1 }], buyingOrigin: { oceanFreight: line(1) }, sellingOrigin: { oceanFreight: line(2) } })
  r = await call('PUT', `/export/quotations/${r.json.data._id}/status`, { status: 'sent' })
  check('dangerous goods without an MSDS file cannot be sent', r.status === 400 && /MSDS/.test(msg(r)), `${r.status} ${msg(r)}`)

  // ─── 10a. per-container weights ────────────────────────────────────
  r = await mk('weights', { containers: [{ containerType: t20._id, quantity: 2, grossWeight: 2400, netWeight: 2000 }, { containerType: t40._id, quantity: 1 }] })
  check('container rows store gross + net weight (optional per row)', r.status === 201 && r.json.data.containers[0].grossWeight === 2400 && r.json.data.containers[0].netWeight === 2000 && r.json.data.containers[1].grossWeight === undefined, msg(r))
  const wId = r.json?.data?._id
  r = await call('PUT', `/export/quotations/${wId}`, { containers: [{ containerType: t20._id, quantity: 2, grossWeight: null, netWeight: 1500 }] })
  check('update can clear a weight (null) and change another', r.status === 200 && r.json.data.containers[0].grossWeight == null && r.json.data.containers[0].netWeight === 1500, msg(r))
  r = await call('PUT', `/export/quotations/${wId}`, { containers: [{ containerType: t20._id, quantity: 2, grossWeight: -5 }] })
  check('negative container weight -> 400', r.status === 400, `${r.status} ${msg(r)}`)

  // ─── 10b. MSDS (dangerous goods files, max 5) ────────────────────────
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  const msdsForm = (files) => {
    const fd = new FormData()
    files.forEach(({ name, bytes, mime }) => fd.append('msds', new Blob([bytes], { type: mime || 'image/png' }), name))
    return fd
  }
  const png = (n) => ({ name: `msds-${n}.png`, bytes: PNG })

  r = await mk('msds-plain', { containers: [{ containerType: t20._id, quantity: 1 }] })
  const plainId = r.json?.data?._id
  r = await call('POST', `/export/quotations/${plainId}/msds`, msdsForm([png(0)]), { form: true })
  check('MSDS upload on a NON-dangerous quotation -> 400', !!plainId && r.status === 400, `${r.status} ${msg(r)}`)

  r = await mk('msds', { isDangerous: true, unNumber: 'UN1203', containers: [{ containerType: t20._id, quantity: 1 }] })
  const dgId = r.json?.data?._id
  check('dangerous quotation starts with no MSDS files', r.status === 201 && Array.isArray(r.json.data.msdsFiles) && r.json.data.msdsFiles.length === 0, msg(r))
  r = await call('POST', `/export/quotations/${dgId}/msds`, msdsForm([png(1), png(2)]), { form: true })
  check('upload 2 MSDS files -> 201, both stored', r.status === 201 && r.json.data.msdsFiles.length === 2 && r.json.data.msdsFiles[0].fileName === 'msds-1.png', `${r.status} ${msg(r)}`)
  r = await call('POST', `/export/quotations/${dgId}/msds`, msdsForm([{ name: 'fake.png', bytes: Buffer.from('this is plainly not image bytes') }]), { form: true })
  check('MSDS with a spoofed mimetype (text sent as image/png) -> 400', r.status === 400, `${r.status} ${msg(r)}`)
  r = await call('POST', `/export/quotations/${dgId}/msds`, msdsForm([{ name: 'note.txt', bytes: Buffer.from('hi'), mime: 'text/plain' }]), { form: true })
  check('MSDS with a disallowed type (text/plain) -> 400', r.status === 400, `${r.status} ${msg(r)}`)
  r = await call('POST', `/export/quotations/${dgId}/msds`, msdsForm([png(3), png(4), png(5)]), { form: true })
  check('3 more files (5 total) -> 201', r.status === 201 && r.json.data.msdsFiles.length === 5, `${r.status} ${msg(r)}`)
  r = await call('POST', `/export/quotations/${dgId}/msds`, msdsForm([png(6)]), { form: true })
  check('a 6th MSDS file -> 400 (limit is 5)', r.status === 400 && /at most 5/i.test(msg(r)), `${r.status} ${msg(r)}`)
  r = await call('POST', `/export/quotations/${dgId}/msds`, msdsForm([png(7), png(8), png(9), png(10), png(11), png(12)]), { form: true })
  check('6 files in one request -> rejected', r.status >= 400, `${r.status} ${msg(r)}`)
  r = await call('GET', `/export/quotations/${dgId}`)
  check('rejected uploads did not change the stored list (still 5)', r.json.data.msdsFiles.length === 5, r.json?.data?.msdsFiles?.length)
  const msdsList = r.json.data.msdsFiles

  const dl = await fetch(`${API}/export/quotations/${dgId}/msds/${msdsList[0]._id}`, { headers: { cookie } })
  const dlBytes = Buffer.from(await dl.arrayBuffer())
  check('download streams the stored file back (auth required)', dl.status === 200 && dlBytes.equals(PNG), dl.status)
  const dlNoAuth = await fetch(`${API}/export/quotations/${dgId}/msds/${msdsList[0]._id}`)
  check('download without a session -> 401', dlNoAuth.status === 401, dlNoAuth.status)

  r = await call('PUT', `/export/quotations/${dgId}`, { msdsFiles: [{ fileName: 'x', filePath: '../../../.env' }] })
  r = await call('GET', `/export/quotations/${dgId}`)
  check('msdsFiles cannot be injected through the JSON update', r.json.data.msdsFiles.length === 5 && !r.json.data.msdsFiles.some((f) => f.filePath.includes('..')), JSON.stringify(r.json.data.msdsFiles.map((f) => f.filePath)))

  r = await call('DELETE', `/export/quotations/${dgId}/msds/${msdsList[4]._id}`)
  check('delete one MSDS file -> 200, 4 left', r.status === 200 && r.json.data.msdsFiles.length === 4, `${r.status} ${msg(r)}`)
  r = await call('DELETE', `/export/quotations/${dgId}/msds/${msdsList[4]._id}`)
  check('deleting it again -> 404', r.status === 404, r.status)

  r = await call('PUT', `/export/quotations/${dgId}`, { isDangerous: false })
  check('switching Dangerous Goods off discards every MSDS file', r.status === 200 && r.json.data.msdsFiles.length === 0 && !r.json.data.unNumber, `${r.status} ${msg(r)}`)

  // ─── 11. Audit trail ─────────────────────────────────────────────────
  r = await call('GET', `/audit-logs?resource=Quotation&limit=50`)
  const mine = (r.json?.logs || []).filter((l) => created.quotationNos.includes(String(l.resourceId || '')))
  check('audit log records status changes for E2E quotations', r.status === 200 && mine.some((l) => l.action === 'SENT') && mine.some((l) => l.action === 'APPROVED') && mine.some((l) => l.action === 'REJECTED'), `${r.status} n=${mine.length}`)

  // ═════════════════════════════════════════════════════════════════════
  // SPRINT 006 — PRD Step 0 alignment
  // ═════════════════════════════════════════════════════════════════════
  const types6 = await list('/master/container-types')
  const t40rf = types6.find((t) => t.code === '40RF'), t20ot = types6.find((t) => t.code === '20OT')
  const vos = await list('/master/vessel-operators')

  // ─── 12. Validity date, mandatory-for-send fields ───────────────────
  r = await mk6('v1', { inquiryDate: daysFromNow(0), validityDate: daysFromNow(-3) })
  check('validity date before the quotation date -> 400', r.status === 400, `${r.status} ${msg(r)}`)

  r = await mk6('v2', { validityDate: undefined, incoterms: undefined, grossWeight: undefined, cbm: undefined, freeTimeBuyingDays: undefined, buyingOrigin: { oceanFreight: line(10) }, sellingOrigin: { oceanFreight: line(20) } })
  const missing6 = r.json?.data?.readinessIssues || []
  check('a draft without the PRD fields saves (201)', r.status === 201, msg(r))
  for (const [label, needle] of [['validity date', 'validity date'], ['incoterms', 'incoterms'], ['total gross weight', 'gross weight'], ['total volume', 'volume'], ['client free time', 'free time']]) {
    check(`readiness asks for ${label}`, missing6.some((i) => i.toLowerCase().includes(needle)), JSON.stringify(missing6))
  }
  r = await call('PUT', `/export/quotations/${r.json.data._id}/status`, { status: 'sent' })
  check('SEND is blocked until those fields are filled (400)', r.status === 400 && /validity date/i.test(msg(r)), `${r.status} ${msg(r)}`)

  // ─── 13. Expiry (lazy), revise, duplicate ───────────────────────────
  const priced = { buyingOrigin: { oceanFreight: line(10) }, sellingOrigin: { oceanFreight: line(20) } }
  r = await mk6('exp', { ...priced, inquiryDate: daysFromNow(-10), validityDate: daysFromNow(-1) })
  const qExp = r.json?.data
  check('a quotation can be saved with a validity date already in the past', r.status === 201, msg(r))
  r = await call('PUT', `/export/quotations/${qExp._id}/status`, { status: 'sent' })
  check('...and sent (draft -> sent does not expire a draft)', r.status === 200, `${r.status} ${msg(r)}`)
  r = await call('GET', `/export/quotations/${qExp._id}`)
  check('reading a sent quotation past its validity date flips it to expired', r.json?.data?.status === 'expired', r.json?.data?.status)
  r = await call('PUT', `/export/quotations/${qExp._id}/status`, { status: 'approved' })
  check('approving an expired quotation -> 400 (names the expiry)', r.status === 400 && /expired/i.test(msg(r)), `${r.status} ${msg(r)}`)
  r = await call('GET', '/export/quotations?status=expired&limit=100')
  check('status=expired filter lists it', r.json?.quotations?.some((x) => x._id === qExp._id), r.json?.quotations?.length)

  r = await call('POST', `/export/quotations/${qExp._id}/revise`)
  const rev = r.json?.data
  check('revise an expired quotation -> 201 as a new draft', r.status === 201 && rev?.status === 'draft', `${r.status} ${msg(r)}`)
  check('revision keeps the base number with an -R1 suffix', rev?.quotationNo === `${qExp.quotationNo}-R1` && rev?.revision === 1 && rev?.baseNo === qExp.quotationNo, `${rev?.quotationNo} ${rev?.revision}`)
  check('revision links back and clears the validity date', rev?.revisedFrom?._id === qExp._id && !rev?.validityDate, JSON.stringify(rev?.revisedFrom))
  check('revision copies the pricing (same totals)', near(rev?.totalSellingPrice, qExp.totalSellingPrice) && near(rev?.totalBuyingCost, qExp.totalBuyingCost), `${rev?.totalSellingPrice}/${qExp.totalSellingPrice}`)
  r = await call('GET', `/export/quotations/${qExp._id}`)
  check('the original now points at its revision', r.json?.data?.revisedTo?.quotationNo === rev?.quotationNo, JSON.stringify(r.json?.data?.revisedTo))
  r = await call('POST', `/export/quotations/${qExp._id}/revise`)
  check('revising twice -> 409', r.status === 409, `${r.status} ${msg(r)}`)
  r = await call('PUT', `/export/quotations/${qExp._id}`, { specialNotes: 'x' })
  check('a superseded quotation can no longer be edited, even with the override (400)', r.status === 400, `${r.status} ${msg(r)}`)
  r = await call('POST', `/export/quotations/${rev._id}/revise`)
  check('a draft cannot be revised (400)', r.status === 400, `${r.status} ${msg(r)}`)
  r = await call('PUT', `/export/quotations/${rev._id}`, { validityDate: daysFromNow(20) })
  check('the revision is a normal draft and can be edited', r.status === 200, `${r.status} ${msg(r)}`)
  r = await call('PUT', `/export/quotations/${rev._id}/status`, { status: 'sent' })
  check('...and sent again', r.status === 200, `${r.status} ${msg(r)}`)
  r = await call('POST', `/export/quotations/${rev._id}/revise`)
  check('revising a sent quotation -> -R2', r.status === 201 && r.json.data.quotationNo === `${qExp.quotationNo}-R2`, `${r.status} ${r.json?.data?.quotationNo}`)

  const q1Now = (await call('GET', `/export/quotations/${q1._id}`)).json?.data
  r = await call('POST', `/export/quotations/${q1._id}/duplicate`)
  const dup = r.json?.data
  if (r.status === 201) { created.quotationIds.push(dup._id); created.quotationNos.push(dup.quotationNo) }
  check('duplicate -> 201 with its own FQ number, as a draft', r.status === 201 && dup.status === 'draft' && dup.quotationNo !== q1.quotationNo && dup.baseNo === dup.quotationNo && dup.revision === 0, `${r.status} ${dup?.quotationNo} ${msg(r)}`)
  check('duplicate copies the rate tables (same totals) and has no booking link', near(dup?.totalSellingPrice, q1Now?.totalSellingPrice) && near(dup?.totalBuyingCost, q1Now?.totalBuyingCost) && dup?.totalSellingPrice > 0 && !dup?.linkedBooking, `${dup?.totalSellingPrice}/${dup?.totalBuyingCost} vs ${q1Now?.totalSellingPrice}/${q1Now?.totalBuyingCost}`)

  // ─── 14. Routing: final destination, transshipment, planned VO ──────
  const otherPort = ports.find((p) => p._id !== pol._id && p._id !== pod._id)
  if (otherPort) {
    r = await mk6('route', { transshipmentPort: otherPort._id, finalDestination: otherPort._id, ...(vos[0] && { plannedVesselOperator: vos[0]._id }) })
    check('transshipment port + final destination are stored and populated', r.status === 201 && r.json.data.transshipmentPort?.code === otherPort.code && r.json.data.finalDestination?.code === otherPort.code, `${r.status} ${msg(r)}`)
    if (vos[0]) check('planned vessel operator is stored', r.json?.data?.plannedVesselOperator?.name === vos[0].name, JSON.stringify(r.json?.data?.plannedVesselOperator))
    const qRoute = r.json?.data
    r = await call('PUT', `/export/quotations/${qRoute._id}`, { transshipmentPort: null, finalDestination: '', plannedVesselOperator: null })
    check('all three optional refs can be cleared again', r.status === 200 && r.json.data.transshipmentPort === null && r.json.data.finalDestination === null && r.json.data.plannedVesselOperator === null, `${r.status} ${msg(r)}`)
  } else {
    console.log('SKIP  routing checks (fewer than 3 ports in master data)')
  }
  r = await mk6('route2', { transshipmentPort: pol._id })
  check('transshipment port equal to POL -> 400', r.status === 400, `${r.status} ${msg(r)}`)

  // ─── 15. Dangerous goods detail ─────────────────────────────────────
  const dgBase = { containers: [{ containerType: t20._id, quantity: 1 }], isDangerous: true }
  r = await mk6('dg-bad-un', { ...dgBase, unNumber: '12' })
  check('UN number must be 4 digits -> 400', r.status === 400, `${r.status} ${msg(r)}`)
  r = await mk6('dg-pg', { ...dgBase, unNumber: '1203', imoClass: '3', packingGroup: 'N/A' })
  check('packing group N/A is refused for class 3 (400)', r.status === 400, `${r.status} ${msg(r)}`)
  r = await mk6('dg-pg-ok', { ...dgBase, unNumber: '1203', imoClass: '2.1', packingGroup: 'N/A' })
  check('packing group N/A is accepted for class 2.1', r.status === 201, `${r.status} ${msg(r)}`)
  r = await mk6('dg-bad-class', { ...dgBase, unNumber: '1203', imoClass: '12' })
  check('unknown IMO class -> 400', r.status === 400, `${r.status} ${msg(r)}`)

  r = await mk6('dg-partial', { ...priced, ...dgBase, unNumber: 'UN1203', imoClass: '3' })
  const dgIssues = r.json?.data?.readinessIssues || []
  check('a draft with only UN + class saves; readiness asks for the rest (name, PG, flash point, emergency contact, MSDS)',
    r.status === 201 && ['proper shipping name', 'packing group', 'flash point', 'emergency contact', 'MSDS'].every((k) => dgIssues.some((i) => i.toLowerCase().includes(k.toLowerCase()))), JSON.stringify(dgIssues))
  const qDg = r.json?.data
  r = await call('PUT', `/export/quotations/${qDg._id}`, { properShippingName: 'Flammable liquid, n.o.s.', packingGroup: 'II', flashPoint: 21, marinePollutant: true, emergencyContact: 'E2E Desk +20 100 000 0000', subsidiaryRisk: '6.1' })
  const dgAfter = r.json?.data
  check('DG detail is stored', r.status === 200 && dgAfter.properShippingName === 'Flammable liquid, n.o.s.' && dgAfter.packingGroup === 'II' && dgAfter.flashPoint === 21 && dgAfter.marinePollutant === true && dgAfter.subsidiaryRisk === '6.1', `${r.status} ${msg(r)}`)
  check('readiness only lacks the MSDS now', (dgAfter?.readinessIssues || []).length === 1 && /MSDS/.test(dgAfter.readinessIssues[0]), JSON.stringify(dgAfter?.readinessIssues))
  r = await call('PUT', `/export/quotations/${qDg._id}`, { isDangerous: false })
  const dgOff = r.json?.data
  check('switching Dangerous Goods off clears every DG detail field',
    r.status === 200 && !dgOff.unNumber && !dgOff.properShippingName && !dgOff.imoClass && !dgOff.packingGroup && dgOff.flashPoint == null && dgOff.marinePollutant === false && !dgOff.emergencyContact, JSON.stringify(dgOff));

  // ─── 16. Reefer / out-of-gauge cargo data follows the container types ──
  if (t40rf && t20ot) {
    r = await mk6('rf', { containers: [{ containerType: t40rf._id, quantity: 1 }], setTemperature: -18, ventilationHumidity: 'closed' })
    check('reefer: set temperature + ventilation are stored', r.status === 201 && r.json.data.setTemperature === -18 && r.json.data.ventilationHumidity === 'closed', `${r.status} ${msg(r)}`)
    const qRf = r.json?.data
    r = await mk6('rf-missing6', { containers: [{ containerType: t40rf._id, quantity: 1 }] })
    check('reefer without a set temperature: draft saves, readiness asks for it', r.status === 201 && r.json.data.readinessIssues.some((i) => /set temperature/i.test(i)), JSON.stringify(r.json?.data?.readinessIssues))
    r = await call('PUT', `/export/quotations/${qRf._id}`, { containers: [{ containerType: t20._id, quantity: 1 }] })
    check('replacing the reefer by a dry container clears the temperature data', r.status === 200 && r.json.data.setTemperature == null && !r.json.data.ventilationHumidity, JSON.stringify([r.json?.data?.setTemperature, r.json?.data?.ventilationHumidity]))

    r = await mk6('oog', { containers: [{ containerType: t20ot._id, quantity: 1 }], oogDimensions: 'L300 W250 H280' })
    check('open top: out-of-gauge dimensions are stored', r.status === 201 && r.json.data.oogDimensions === 'L300 W250 H280', `${r.status} ${msg(r)}`)
    r = await call('PUT', `/export/quotations/${r.json.data._id}`, { containers: [{ containerType: t20._id, quantity: 1 }] })
    check('dropping the open-top container clears the out-of-gauge data', r.status === 200 && !r.json.data.oogDimensions, JSON.stringify(r.json?.data?.oogDimensions))
  } else {
    console.log('SKIP  reefer / out-of-gauge checks (40RF or 20OT missing6 from master data)')
  }

  // ─── 17. Weight / volume capacity (ContainerType maxPayloadKg + capacityCbm) ──
  r = await call('POST', '/master/container-types', { code: `20${RUN}-CAP`, label: `${RUN} capacity type`, maxPayloadKg: 1000, capacityCbm: 10 })
  const tCap = r.json?.data
  check('container type accepts a max payload and a capacity', r.status === 201 && tCap?.maxPayloadKg === 1000 && tCap?.capacityCbm === 10, `${r.status} ${msg(r)}`)
  r = await call('POST', '/master/container-types', { code: `20${RUN}-NEG`, label: 'negative', maxPayloadKg: -5 })
  check('negative max payload -> 400', r.status === 400, `${r.status} ${msg(r)}`)
  if (tCap) {
    const capLine = [{ containerType: tCap._id, quantity: 2 }] // limits: 2000 kg / 20 CBM
    r = await mk6('cap-w', { containers: capLine, grossWeight: 2500, cbm: 5 })
    check('gross weight above Σ(qty × payload) -> 400 (hard stop)', r.status === 400 && /payload/i.test(msg(r)), `${r.status} ${msg(r)}`)
    r = await mk6('cap-v', { containers: capLine, grossWeight: 500, cbm: 25 })
    check('volume above Σ(qty × capacity) -> 400', r.status === 400 && /capacity/i.test(msg(r)), `${r.status} ${msg(r)}`)
    r = await mk6('cap-ok', { containers: capLine, grossWeight: 1950, cbm: 5 })
    check('above 95% of the payload but within it saves with a warning', r.status === 201 && r.json.data.warnings.some((w) => /95%/.test(w)), `${r.status} ${JSON.stringify(r.json?.data?.warnings)}`)
    r = await mk6('cap-low', { containers: capLine, grossWeight: 500, cbm: 5 })
    check('a comfortable load has no warning', r.status === 201 && r.json.data.warnings.length === 0, JSON.stringify(r.json?.data?.warnings))
    r = await mk6('cap-mixed', { containers: [...capLine, { containerType: t20._id, quantity: 1 }], grossWeight: 99999, cbm: 99999 })
    check('a type without capacity data switches the check off (no false stop)', r.status === 201, `${r.status} ${msg(r)}`)
  }

  // ─── 18. Per-line payable-to / bill-to / payment responsibility ─────
  r = await mk6('meta', {
    containers: [{ containerType: t20._id, quantity: 2 }],
    buyingOrigin: { oceanFreight: { ...line(100), payableType: 'Carrier', payableTo: 'E2E Line' }, custom: [{ label: 'Seal', rate20: 5, payableType: 'Terminal', payableTo: 'E2E Terminal' }] },
    sellingOrigin: { oceanFreight: { ...line(150), billTo: 'Shipper', paymentResponsibility: 'Prepaid' } },
    sellingDestination: { dthc: { ...line(40), billTo: 'Consignee', paymentResponsibility: 'Collect' } },
  })
  const qMeta = r.json?.data
  check('payable-to / bill-to / payment metadata is stored and returned',
    r.status === 201 && qMeta.buyingOrigin.oceanFreight.payableType === 'Carrier' && qMeta.buyingOrigin.oceanFreight.payableTo === 'E2E Line' &&
    qMeta.buyingOrigin.custom[0].payableTo === 'E2E Terminal' && qMeta.sellingOrigin.oceanFreight.billTo === 'Shipper' &&
    qMeta.sellingDestination.dthc.paymentResponsibility === 'Collect', `${r.status} ${msg(r)}`)
  check('metadata does not change the maths (buy 210 / sell 380)', near(qMeta?.totalBuyingCost, 210) && near(qMeta?.totalSellingPrice, 380), `${qMeta?.totalBuyingCost}/${qMeta?.totalSellingPrice}`)
  r = await mk6('meta-bad', { buyingOrigin: { oceanFreight: { ...line(1), payableType: 'Nobody' } } })
  check('unknown payable-to type -> 400', r.status === 400, `${r.status} ${msg(r)}`)
  r = await mk6('meta-bad2', { sellingOrigin: { oceanFreight: { ...line(1), paymentResponsibility: 'Maybe' } } })
  check('unknown payment responsibility -> 400', r.status === 400, `${r.status} ${msg(r)}`)

  // ─── 19. Carrier eligibility (POD served / accepts DG) ──────────────
  const otherP = ports.find((p) => p._id !== pod._id)
  r = await call('POST', '/master/nvoccs', { name: `${RUN} Narrow Carrier`, code: `${RUN}-N1`, portsServed: [otherP._id], acceptsDg: false, defaultFreeTimeDays: 7 })
  const narrow = r.json?.data
  check('carrier master stores ports served / accepts DG / default free time', r.status === 201 && narrow?.portsServed?.length === 1 && narrow?.acceptsDg === false && narrow?.defaultFreeTimeDays === 7, `${r.status} ${msg(r)}`)
  r = await call('POST', '/master/nvoccs', { name: `${RUN} Bad Carrier`, code: `${RUN}-N2`, portsServed: ['not-an-id'] })
  check('invalid port id in ports served -> 400', r.status === 400, `${r.status} ${msg(r)}`)
  if (narrow) {
    r = await mk6('elig', { ...priced, nvocc: narrow._id })
    const qElig = r.json?.data
    check('a carrier that does not serve the POD still saves as a draft, but warns', r.status === 201 && qElig.warnings.some((w) => /does not serve/i.test(w)), `${r.status} ${JSON.stringify(qElig?.warnings)}`)
    check('readiness lists the carrier problem', qElig?.readinessIssues.some((i) => /does not serve/i.test(i)), JSON.stringify(qElig?.readinessIssues))
    r = await call('PUT', `/export/quotations/${qElig._id}/status`, { status: 'sent' })
    check('SEND is blocked for an ineligible carrier (400)', r.status === 400 && /does not serve/i.test(msg(r)), `${r.status} ${msg(r)}`)
    r = await call('PUT', `/export/quotations/${qElig._id}`, { nvocc: nvocc._id })
    check('switching to an eligible carrier clears the warning', r.status === 200 && !r.json.data.warnings.some((w) => /does not serve/i.test(w)), JSON.stringify(r.json?.data?.warnings))

    r = await call('PUT', `/master/nvoccs/${narrow._id}`, { portsServed: [pod._id] })
    r = await mk6('elig-dg', { nvocc: narrow._id, containers: [{ containerType: t20._id, quantity: 1 }], isDangerous: true, unNumber: '1203' })
    check('a carrier that does not accept dangerous goods is flagged for a DG quotation', r.status === 201 && r.json.data.readinessIssues.some((i) => /does not accept dangerous goods/i.test(i)), `${r.status} ${JSON.stringify(r.json?.data?.readinessIssues)}`)
  }

  // ─── 20. Credit hold ────────────────────────────────────────────────
  r = await call('POST', '/master/customers', { name: `${RUN} Held Client`, phone: '+20100000009', email: 'held@example.com', creditHold: true })
  const held = r.json?.data
  check('customer stores a credit-hold flag', r.status === 201 && held?.creditHold === true, `${r.status} ${msg(r)}`)
  r = await mk6('held', { customer: held?._id, clientName: `${RUN} Held Client` })
  check('a quotation for a customer on credit hold -> 400', r.status === 400 && /credit hold/i.test(msg(r)), `${r.status} ${msg(r)}`)
  r = await mk6('held-switch')
  const qSwitch = r.json?.data
  r = await call('PUT', `/export/quotations/${qSwitch._id}`, { customer: held._id })
  check('moving an existing quotation to a customer on hold -> 400', r.status === 400 && /credit hold/i.test(msg(r)), `${r.status} ${msg(r)}`)
  r = await mk6('held-later', priced)
  const qLater = r.json?.data
  await call('PUT', `/master/customers/${clientId}`, { creditHold: true })
  r = await call('PUT', `/export/quotations/${qLater._id}/status`, { status: 'sent' })
  check('a customer put on hold AFTER the quotation was drafted blocks sending it', r.status === 400 && /credit hold/i.test(msg(r)), `${r.status} ${msg(r)}`)
  await call('PUT', `/master/customers/${clientId}`, { creditHold: false })
  r = await call('PUT', `/export/quotations/${qLater._id}/status`, { status: 'sent' })
  check('...and it sends once the hold is lifted', r.status === 200, `${r.status} ${msg(r)}`)

  // ─── 21. Client-facing PDF ──────────────────────────────────────────
  {
    const res = await fetch(`${API}/export/quotations/${q1._id}/pdf`, { headers: { cookie } })
    const buf = Buffer.from(await res.arrayBuffer())
    check('PDF download -> 200 application/pdf', res.status === 200 && (res.headers.get('content-type') || '').includes('application/pdf'), `${res.status} ${res.headers.get('content-type')}`)
    check('the file is a real PDF', buf.subarray(0, 5).toString() === '%PDF-' && buf.length > 1500, `${buf.subarray(0, 8).toString()} ${buf.length}`)
    check('the download is named after the quotation', (res.headers.get('content-disposition') || '').includes(q1.quotationNo), res.headers.get('content-disposition'))
    const anon = await fetch(`${API}/export/quotations/${q1._id}/pdf`)
    check('PDF without a session -> 401', anon.status === 401, anon.status)
  }

  // ─── 22. Audit trail for revise / duplicate ─────────────────────────
  r = await call('GET', '/audit-logs?resource=Quotation&limit=100')
  const mine6 = (r.json?.logs || []).filter((l) => created.quotationNos.some((n) => String(l.resourceId || '').startsWith(n)))
  check('audit log records REVISE and DUPLICATE', r.status === 200 && mine6.some((l) => l.action === 'REVISE') && mine6.some((l) => l.action === 'DUPLICATE'), `${r.status} n=${mine6.length}`)

  // ═════════════════════════════════════════════════════════════════════
  // Hard delete (permanent; no soft delete). A quotation with a job must have
  // that job deleted first.
  // ═════════════════════════════════════════════════════════════════════
  r = await call('DELETE', `/export/quotations/${q1._id}`, undefined, { noAuth: true })
  check('DELETE without a session -> 401', r.status === 401, r.status)
  r = await call('DELETE', '/export/quotations/000000000000000000000000')
  check('DELETE of an unknown quotation -> 404', r.status === 404, r.status)

  r = await call('DELETE', `/export/quotations/${q1._id}`)
  check('DELETE a quotation that has a job -> 409 telling you to delete the job first', r.status === 409 && /Delete the job/i.test(msg(r)) && /OPS Jobs/.test(msg(r)), `${r.status} ${msg(r)}`)
  r = await call('GET', `/export/quotations/${q1._id}`)
  check('...and the quotation is untouched', r.status === 200, r.status)

  const jobBooking = (await call('GET', '/export/bookings?limit=100')).json?.bookings?.find((b) => String(b.quotation?._id || b.quotation) === q1._id)
  r = await call('DELETE', `/export/bookings/${jobBooking?._id}`)
  check('the job (booking) is deleted first', r.status === 200, `${r.status} ${msg(r)}`)
  r = await call('GET', `/export/quotations/${q1._id}`)
  check('deleting the job gives the quotation its "not converted" state back (link + convertedAt cleared)', r.status === 200 && !r.json.data.linkedBooking && !r.json.data.convertedAt, JSON.stringify(r.json?.data?.linkedBooking))
  r = await call('DELETE', `/export/quotations/${q1._id}`)
  check('now the quotation can be deleted -> 200', r.status === 200, `${r.status} ${msg(r)}`)
  r = await call('GET', `/export/quotations/${q1._id}`)
  check('hard delete: it is gone (GET -> 404), not just flagged', r.status === 404, r.status)
  r = await call('GET', '/export/quotations?limit=100&search=' + encodeURIComponent(q1.quotationNo))
  check('...and absent from the list', !(r.json?.quotations || []).some((x) => x._id === q1._id))

  // a dangerous quotation: its MSDS files leave the disk too
  r = await mk6('del-dg', { isDangerous: true, unNumber: '1203' })
  const delDg = r.json?.data
  r = await call('POST', `/export/quotations/${delDg._id}/msds`, msdsForm([png(7)]), { form: true })
  const stored = r.json?.data?.msdsFiles?.[0]?.filePath
  const onDisk = async () => { try { await (await import('node:fs/promises')).access(BACKEND + 'uploads/msds/' + stored); return true } catch { return false } }
  check('MSDS file stored on disk before the delete', r.status === 201 && !!stored && (await onDisk()), `${r.status} ${stored}`)
  r = await call('DELETE', `/export/quotations/${delDg._id}`)
  check('delete a dangerous quotation -> 200', r.status === 200, `${r.status} ${msg(r)}`)
  await new Promise((res) => setTimeout(res, 300))
  check('...and its MSDS file is removed from disk', !(await onDisk()))

  // any status can be deleted (sent / rejected / expired too) when no job exists
  r = await mk6('del-sent', priced)
  const delSent = r.json?.data
  await call('PUT', `/export/quotations/${delSent._id}/status`, { status: 'sent' })
  r = await call('DELETE', `/export/quotations/${delSent._id}`)
  check('a SENT quotation can be deleted (permission quotation:update)', r.status === 200, `${r.status} ${msg(r)}`)

  // revisions: deleting the newest unlinks the original, which becomes editable again
  r = await mk6('del-rev', { ...priced, inquiryDate: daysFromNow(-10), validityDate: daysFromNow(-1) })
  const delOrig = r.json?.data
  await call('PUT', `/export/quotations/${delOrig._id}/status`, { status: 'sent' })
  r = await call('POST', `/export/quotations/${delOrig._id}/revise`)
  const delRev = r.json?.data
  r = await call('DELETE', `/export/quotations/${delRev._id}`)
  check('delete a revision -> 200', r.status === 200, `${r.status} ${msg(r)}`)
  r = await call('GET', `/export/quotations/${delOrig._id}`)
  check('the original no longer points at the deleted revision, and can be revised again', r.json?.data?.revisedTo === null, JSON.stringify(r.json?.data?.revisedTo))
  r = await call('POST', `/export/quotations/${delOrig._id}/revise`)
  check('...revising again works (-R1 is free again)', r.status === 201 && r.json.data.quotationNo === `${delOrig.quotationNo}-R1`, `${r.status} ${r.json?.data?.quotationNo}`)
  // deleting the ORIGINAL clears the revision's back-link
  const secondRev = r.json?.data
  r = await call('DELETE', `/export/quotations/${delOrig._id}`)
  check('delete the original of a revision -> 200', r.status === 200, `${r.status} ${msg(r)}`)
  r = await call('GET', `/export/quotations/${secondRev._id}`)
  check('the remaining revision keeps working with its back-link cleared', r.status === 200 && r.json.data.revisedFrom === null, JSON.stringify(r.json?.data?.revisedFrom))

  r = await call('GET', '/audit-logs?resource=Quotation&limit=100')
  check('audit log records DELETE', (r.json?.logs || []).some((l) => l.action === 'DELETE' && created.quotationNos.some((n) => String(l.resourceId || '').startsWith(n))), `n=${r.json?.logs?.length}`)
} catch (err) {
  check('test run completed without an unexpected error', false, err.stack || err.message)
} finally {
  // ─── cleanup — only documents this run created ──────────────────────
  try {
    await mongoose.connect(process.env.MONGO_URI)
    const dbh = mongoose.connection.db
    const leftovers = await dbh.collection('quotations').find({ clientName: { $regex: `^${RUN}` }, 'msdsFiles.0': { $exists: true } }).project({ msdsFiles: 1 }).toArray()
    for (const q of leftovers) for (const f of q.msdsFiles) await unlink(BACKEND + 'uploads/msds/' + f.filePath).catch(() => {})
    await dbh.collection('customers').deleteMany({ name: { $regex: `^${RUN}` } })
    await dbh.collection('nvoccs').deleteMany({ name: { $regex: `^${RUN}` } })
    await dbh.collection('containertypes').deleteMany({ code: { $regex: `^20${RUN}` } })
    const delQ = await dbh.collection('quotations').deleteMany({ clientName: { $regex: `^${RUN}` } })
    // Give the consumed quotation numbers back ONLY while ours are still the tail.
    const qYear = new Date().getFullYear()
    for (const no of [...created.quotationNos].reverse()) {
      const seq = Number(/(\d{4})$/.exec(no)?.[1])
      const res = await dbh.collection('jobcounters').updateOne({ _id: `quotation-${qYear}`, seq }, { $inc: { seq: -1 } })
      if (!res.modifiedCount) break
    }

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
