// Backend E2E for the Master Data update — NVOCC contacts/contract fields, the
// new VO / Vessel / Agent / Party / Package / Unit entities, and the Depot and
// Customer extensions. Drives the real HTTP API (default :5000). Run:
// cd e2e && npm run masterdata:api   (backend must be running). Everything it
// creates is prefixed E2E-MD- and deleted through the API when done.
import { pathToFileURL, fileURLToPath } from 'node:url'

const BACKEND = fileURLToPath(new URL('../../backend/', import.meta.url))
const { default: dotenv } = await import(pathToFileURL(BACKEND + 'node_modules/dotenv/lib/main.js').href)
dotenv.config({ path: BACKEND + '.env' })

const API = process.env.API || 'http://localhost:5000/api'
const RUN = `E2E-MD-${Date.now().toString(36).toUpperCase()}`
const results = []
const created = [] // [path, id] — deleted in reverse order on exit

const check = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + detail}`)
}
const msg = (r) => JSON.stringify(r.json?.message || r.json?.errors?.map((e) => e.msg) || r.json)

let cookie = ''
const call = async (method, path, body, { noAuth = false } = {}) => {
  const headers = {}
  if (cookie && !noAuth) headers.cookie = cookie
  if (body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const sc = res.headers.getSetCookie?.() || []
  if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ')
  let json = null
  try { json = await res.json() } catch { /* empty */ }
  return { status: res.status, json }
}
const make = async (path, body) => {
  const r = await call('POST', path, body)
  if (r.status === 201) created.push([path, r.json.data._id])
  return r
}

const contactsIn = [
  { name: 'Alice Ops', title: 'Ops Manager', email: 'alice@example.com', phone: '+20100000001' },
  { name: 'Bob Sales', title: 'Sales', email: 'bob@example.com', phone: '+20100000002' },
]

try {
  let r = await call('GET', '/master/vessels', undefined, { noAuth: true })
  check('unauthenticated GET /master/vessels -> 401', r.status === 401, r.status)
  r = await call('POST', '/auth/login', { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_DEFAULT_PASSWORD }, { noAuth: true })
  if (r.status !== 200) r = await call('POST', '/auth/login', { email: 'admin@nvocc.local', password: 'ChangeMe123!' }, { noAuth: true })
  check('admin login', r.status === 200, msg(r))
  if (r.status !== 200) throw new Error('cannot log in — aborting')

  // ─── NVOCC ───────────────────────────────────────────────────────────
  const nv = {
    name: `${RUN} NVOCC`, code: `${RUN}-NV`, address: '1 Test St', country: 'Egypt', city: 'Cairo', taxNumber: 'TAX-1', registrationNumber: 'REG-1',
    contractType: 'Contract', contractValidFrom: '2026-01-01', contractValidTo: '2026-12-31', contacts: contactsIn,
    localAgentName: 'should be dropped', localAgentContact: 'should be dropped',
  }
  r = await make('/master/nvoccs', nv)
  check('NVOCC create with address/tax/registration/contract/contacts -> 201', r.status === 201, msg(r))
  const nvocc = r.json?.data
  check('NVOCC stores address, tax number, registration number', nvocc?.address === '1 Test St' && nvocc?.taxNumber === 'TAX-1' && nvocc?.registrationNumber === 'REG-1', JSON.stringify(nvocc))
  check('NVOCC stores 2 contact rows (name/title/email/phone)', nvocc?.contacts?.length === 2 && nvocc.contacts[0].title === 'Ops Manager' && nvocc.contacts[1].phone === '+20100000002', JSON.stringify(nvocc?.contacts))
  check('NVOCC no longer stores localAgentName / localAgentContact', nvocc?.localAgentName === undefined && nvocc?.localAgentContact === undefined)

  check('NVOCC stores country + city', nvocc?.country === 'Egypt' && nvocc?.city === 'Cairo', JSON.stringify(nvocc))
  check('NVOCC no longer stores contract valid-from / valid-to (fields removed)', nvocc?.contractValidFrom === undefined && nvocc?.contractValidTo === undefined && nvocc?.contractType === 'Contract', JSON.stringify(nvocc))
  r = await call('POST', '/master/nvoccs', { ...nv, code: `${RUN}-NV3`, contacts: [{ name: '', email: 'x@y.com' }] })
  check('NVOCC contact row without a name -> 400', r.status === 400, r.status)
  r = await call('POST', '/master/nvoccs', { ...nv, code: `${RUN}-NV4`, contacts: [{ name: 'Z', email: 'not-an-email' }] })
  check('NVOCC contact with invalid email -> 400', r.status === 400, r.status)
  r = await call('POST', '/master/nvoccs', { ...nv, code: `${RUN}-NV5`, contractType: 'Weekly' })
  check('NVOCC invalid contract type -> 400', r.status === 400, r.status)

  r = await call('PUT', `/master/nvoccs/${nvocc._id}`, { contacts: [contactsIn[1]], contractType: '' })
  check('NVOCC update removes a contact row and clears contract type', r.status === 200 && r.json.data.contacts.length === 1 && r.json.data.contacts[0].name === 'Bob Sales' && !r.json.data.contractType, msg(r))

  // ─── Vessel Operator (VO) + Vessel ───────────────────────────────────
  r = await make('/master/vessel-operators', { name: `${RUN} VO`, code: `${RUN}-VO`, address: 'Port Said', taxNumber: 'T', registrationNumber: 'R', contractType: 'Spot', contacts: contactsIn })
  check('VO create with NVOCC-style inputs -> 201; contract type + dates are not stored', r.status === 201 && r.json.data.contacts.length === 2 && r.json.data.contractType === undefined && r.json.data.contractValidFrom === undefined, msg(r))
  const vo = r.json?.data
  r = await call('POST', '/master/vessel-operators', { name: 'dup', code: `${RUN}-VO` })
  check('VO duplicate code -> 409', r.status === 409, `${r.status} ${msg(r)}`)

  r = await call('POST', '/master/vessels', { name: `${RUN} Vessel` })
  check('Vessel without a VO -> 400', r.status === 400, r.status)
  r = await call('POST', '/master/vessels', { vesselOperator: '64b64b64b64b64b64b64b64b', name: `${RUN} Vessel` })
  check('Vessel with a nonexistent VO -> 400', r.status === 400, r.status)
  r = await make('/master/vessels', { vesselOperator: vo._id, name: `${RUN} Vessel` })
  check('Vessel create (VO select + name) -> 201, VO populated', r.status === 201 && r.json.data.vesselOperator?.code === `${RUN}-VO`, msg(r))
  const vessel = r.json?.data
  r = await call('POST', '/master/vessels', { vesselOperator: vo._id, name: `${RUN} Vessel` })
  check('Vessel duplicate name under same VO -> 409', r.status === 409, `${r.status} ${msg(r)}`)
  r = await call('GET', `/master/vessels?vesselOperator=${vo._id}`)
  check('GET /vessels?vesselOperator= filters by VO', r.status === 200 && r.json.data.length === 1 && r.json.data[0]._id === vessel._id, msg(r))
  r = await call('GET', '/master/vessels?vesselOperator[$ne]=x')
  check('GET /vessels with an operator-injection query does not crash or leak a filter', r.status === 200, r.status)
  r = await call('DELETE', `/master/vessel-operators/${vo._id}`)
  check('VO delete blocked while it has vessels -> 409', r.status === 409, `${r.status} ${msg(r)}`)

  // ─── Depot ───────────────────────────────────────────────────────────
  r = await make('/master/depots', { name: `${RUN} Depot`, code: `${RUN}-DP`, address: 'Yard 1', taxNumber: 'T', registrationNumber: 'R', contractType: 'Contract', contractValidFrom: '2026-02-01', contractValidTo: '2026-03-01', contacts: contactsIn })
  check('Depot create with contact rows -> 201; contract type kept, valid-from/to dropped', r.status === 201 && r.json.data.contacts.length === 2 && r.json.data.registrationNumber === 'R' && r.json.data.contractType === 'Contract' && r.json.data.contractValidFrom === undefined, msg(r))
  r = await call('GET', '/master/depots')
  check('existing depots still list (backward compatible, contacts default [])', r.status === 200 && r.json.data.every((d) => Array.isArray(d.contacts)), msg(r))

  // ─── Customer ────────────────────────────────────────────────────────
  r = await make('/master/customers', { name: `${RUN} Customer`, address: 'Somewhere', country: 'Egypt', governorate: 'Cairo', contacts: [contactsIn[0]] })
  check('Customer create with country + governorate + contact rows -> 201', r.status === 201 && r.json.data.country === 'Egypt' && r.json.data.governorate === 'Cairo' && r.json.data.contacts.length === 1, msg(r))
  r = await call('POST', '/master/customers', { name: `${RUN} C2` })
  if (r.status === 201) created.push(['/master/customers', r.json.data._id])
  check('Customer without the new fields still creates (all optional)', r.status === 201, msg(r))

  // ─── Customer certificates (tax + registration) ──────────────────────
  const custId = created.find(([p]) => p === '/master/customers')?.[1]
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  const certForm = (name, bytes = PNG, mime = 'image/png') => { const fd = new FormData(); fd.append('customerFile', new Blob([bytes], { type: mime }), name); return fd }
  const upload = async (kind, fd) => {
    const res = await fetch(API + `/master/customers/${custId}/files/${kind}`, { method: 'POST', headers: { cookie }, body: fd })
    return { status: res.status, json: await res.json().catch(() => null) }
  }
  r = await upload('tax', certForm('tax.png'))
  check('upload a tax certificate -> 201, stored on the customer', r.status === 201 && r.json.data.taxCertificateFile?.fileName === 'tax.png' && !r.json.data.registrationCertificateFile?.fileName, `${r.status} ${msg(r)}`)
  r = await upload('registration', certForm('reg.png'))
  check('upload a registration certificate -> 201, tax one untouched', r.status === 201 && r.json.data.registrationCertificateFile?.fileName === 'reg.png' && r.json.data.taxCertificateFile?.fileName === 'tax.png', `${r.status} ${msg(r)}`)
  r = await upload('passport', certForm('x.png'))
  check('unknown certificate kind -> 400', r.status === 400, r.status)
  r = await upload('tax', certForm('fake.png', Buffer.from('plainly not an image')))
  check('spoofed certificate (text sent as image/png) -> 400', r.status === 400, `${r.status} ${msg(r)}`)
  r = await upload('tax', certForm('note.txt', Buffer.from('hi'), 'text/plain'))
  check('disallowed certificate type (text/plain) -> 400', r.status === 400, r.status)
  const dl = await fetch(API + `/master/customers/${custId}/files/tax`, { headers: { cookie } })
  check('certificate download streams the stored bytes (auth required)', dl.status === 200 && Buffer.from(await dl.arrayBuffer()).equals(PNG), dl.status)
  check('certificate download without a session -> 401', (await fetch(API + `/master/customers/${custId}/files/tax`)).status === 401)
  r = await call('PUT', `/master/customers/${custId}`, { name: `${RUN} Customer`, taxCertificateFile: { fileName: 'x', filePath: '../../../.env' } })
  r = await call('GET', '/master/customers')
  const cust = r.json.data.find((c) => c._id === custId)
  check('certificate metadata cannot be injected through the JSON update', cust.taxCertificateFile.fileName === 'tax.png' && !cust.taxCertificateFile.filePath.includes('..'), JSON.stringify(cust.taxCertificateFile))
  r = await upload('tax', certForm('tax2.png'))
  check('uploading again replaces the certificate', r.status === 201 && r.json.data.taxCertificateFile.fileName === 'tax2.png', `${r.status} ${msg(r)}`)
  r = await call('DELETE', `/master/customers/${custId}/files/tax`)
  check('delete a certificate -> 200, registration one kept', r.status === 200 && !r.json.data.taxCertificateFile?.fileName && r.json.data.registrationCertificateFile?.fileName === 'reg.png', `${r.status} ${msg(r)}`)
  r = await call('GET', `/master/customers/${custId}/files/tax`)
  check('downloading a deleted certificate -> 404', r.status === 404, r.status)

  // ─── Agent ───────────────────────────────────────────────────────────
  r = await make('/master/agents', { name: `${RUN} Agent`, code: `${RUN}-AG`, country: 'China', address: 'Shanghai', taxNumber: 'T', registrationNumber: 'R', contractType: 'Spot', contacts: contactsIn })
  check('Agent create with NVOCC-style inputs + country -> 201', r.status === 201 && r.json.data.country === 'China' && r.json.data.contacts.length === 2, msg(r))
  r = await make('/master/agents', { name: `${RUN} A2` })
  check('Agent without a code -> 201 (code is optional)', r.status === 201 && !r.json.data.code, msg(r))
  r = await make('/master/agents', { name: `${RUN} A3`, code: '  ' })
  check('a second code-less (blank code) Agent is also fine (sparse unique index)', r.status === 201 && !r.json.data.code, msg(r))
  r = await call('POST', '/master/agents', { name: 'dup', code: `${RUN}-AG` })
  check('Agent duplicate code -> 409', r.status === 409, `${r.status} ${msg(r)}`)
  const agentId = created.find(([p]) => p === '/master/agents')?.[1]
  r = await call('PATCH', `/master/agents/${agentId}/toggle`)
  check('Agent toggle -> inactive', r.status === 200 && r.json.data.isActive === false, msg(r))

  // ─── Party ───────────────────────────────────────────────────────────
  const partyBody = (t) => ({ partyType: t, name: `${RUN} ${t}`, country: 'Egypt', address: 'A', contacts: [contactsIn[0]] })
  r = await call('POST', '/master/parties', { ...partyBody('carrier') })
  check('Party with an invalid type -> 400', r.status === 400, r.status)
  for (const t of ['shipper', 'consignee', 'notify']) {
    r = await make('/master/parties', partyBody(t))
    check(`Party create (${t}, no code, with country) -> 201`, r.status === 201 && r.json.data.partyType === t && r.json.data.country === 'Egypt' && !r.json.data.code, msg(r))
  }
  r = await call('POST', '/master/parties', { ...partyBody('notify'), contractType: 'Contract', contractValidFrom: '2026-01-01' })
  if (r.status === 201) created.push(['/master/parties', r.json.data._id])
  check('Party ignores contract fields (not part of the schema)', r.status === 201 && !r.json.data.contractType && !r.json.data.contractValidFrom, msg(r))
  r = await call('GET', '/master/parties?partyType=notify')
  check('GET /parties?partyType=notify filters by type', r.status === 200 && r.json.data.some((p) => p.name === `${RUN} notify`) && r.json.data.every((p) => p.partyType === 'notify'), msg(r))

  // ─── Package ─────────────────────────────────────────────────────────
  r = await make('/master/packages', { name: `${RUN} Pallet` })
  check('Package create (name only) -> 201', r.status === 201, msg(r))
  r = await call('POST', '/master/packages', { name: `${RUN} Pallet` })
  check('Package duplicate name -> 409', r.status === 409, `${r.status} ${msg(r)}`)
  r = await call('POST', '/master/packages', { name: '  ' })
  check('Package blank name -> 400', r.status === 400, r.status)

  // ─── Unit ────────────────────────────────────────────────────────────
  r = await call('POST', '/master/units', { type: 'volume', name: 'Litre', symbol: 'L' })
  check('Unit with an invalid type -> 400', r.status === 400, r.status)
  r = await make('/master/units', { type: 'length', name: `${RUN} Metre`, symbol: `${RUN}m` })
  check('Unit create (length) -> 201', r.status === 201, msg(r))
  r = await make('/master/units', { type: 'weight', name: `${RUN} Kilogram`, symbol: `${RUN}kg` })
  check('Unit create (weight) -> 201', r.status === 201, msg(r))
  r = await call('POST', '/master/units', { type: 'length', name: 'Dup', symbol: `${RUN}m` })
  check('Unit duplicate symbol within a type -> 409', r.status === 409, `${r.status} ${msg(r)}`)
  r = await call('GET', '/master/units?type=weight')
  check('GET /units?type=weight filters by type', r.status === 200 && r.json.data.some((u) => u.symbol === `${RUN}kg`) && r.json.data.every((u) => u.type === 'weight'), msg(r))

  // ─── Old Carrier master data is gone ─────────────────────────────────
  r = await call('GET', '/master/carriers')
  check('the old /master/carriers endpoint no longer exists', r.status === 404, r.status)

  // ─── Quotation's NVOCC populate still resolves ───────────────────────
  r = await call('GET', '/export/quotations?limit=1')
  check('quotation list still works after the NVOCC field change', r.status === 200, msg(r))
} catch (err) {
  check('test run completed without an unexpected error', false, err.stack || err.message)
} finally {
  // Reverse order: vessel before its VO, etc.
  let removed = 0
  for (const [path, id] of [...created].reverse()) {
    const r = await call('DELETE', `${path}/${id}`)
    if (r.status === 200) removed++
    else console.log(`CLEANUP: DELETE ${path}/${id} -> ${r.status} — remove by hand`)
  }
  console.log(`cleanup: removed ${removed}/${created.length} record(s)`)
  const failed = results.filter((x) => !x.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed, run=${RUN}`)
  process.exitCode = failed.length ? 1 : 0
}
