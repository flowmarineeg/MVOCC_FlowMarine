// Browser E2E for the Booking & Job module (merged 5-step details page +
// its B&L content) — real Edge (playwright-core, no browser download), real
// UI on :3000, real API on :5000. Run: cd e2e && npm install && npm run
// booking:ui   (backend + frontend must be running). Creates E2E-BOOKING-UI-*
// data (bookings, container stock, two temp roles+users) and deletes it when
// done.
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const BACKEND = fileURLToPath(new URL('../../backend/', import.meta.url))
const imp = (p) => import(pathToFileURL(BACKEND + p).href)
const { default: dotenv } = await imp('node_modules/dotenv/lib/main.js')
dotenv.config({ path: BACKEND + '.env' })
const { default: mongoose } = await imp('node_modules/mongoose/index.js')
const { hashPassword } = await imp('src/utils/password.util.js')

const WEB = process.env.WEB || 'http://localhost:3000'
const API = process.env.API || 'http://localhost:5000/api'
const RUN = `E2E-BOOKING-UI-${Date.now().toString(36).toUpperCase()}`
const SHOTS = new URL('./shots/', import.meta.url)
mkdirSync(SHOTS, { recursive: true })

const results = []
const consoleErrors = []
const check = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + detail}`)
  return !!cond
}
const vis = (loc, t = 10000) => loc.first().waitFor({ state: 'visible', timeout: t }).then(() => true).catch(() => false)
const hasValue = (page, v, t = 20000) => page.waitForFunction((val) => [...document.querySelectorAll('input,textarea')].some((i) => i.value === val), v, { timeout: t }).then(() => true).catch(() => false)
const toastShown = (page, re, t = 10000) => page.getByText(re).first().waitFor({ timeout: t }).then(() => true).catch(() => false)
const jobIdFrom = (u) => u.match(/bookings\/([0-9a-f]{24})/)?.[1] || null

// A tiny real 1x1 PNG on disk — used for the shipping-declaration / customs
// certificate file-picker uploads (must pass the real signature check).
const PNG_PATH = fileURLToPath(new URL('./tiny.png', import.meta.url))
writeFileSync(PNG_PATH, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'))

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
context.setDefaultTimeout(30000)
const page = await context.newPage()
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${m.text()} @ ${page.url()}`) })
page.on('pageerror', (e) => consoleErrors.push(`PAGEERROR ${e.message} @ ${page.url()}`))

const api = async (method, path, data) => {
  const res = await context.request.fetch(API + path, { method, data, headers: { 'content-type': 'application/json' } })
  return { status: res.status(), json: await res.json().catch(() => null) }
}

// ─── helpers, matching the app's own markup conventions ────────────────
const fieldInput = (labelRe, nth = 0) => page.locator('label').filter({ hasText: labelRe }).nth(nth).locator('xpath=..').locator('input, textarea').first()
async function pick(labelRe, optionText, { nth = 0, search } = {}) {
  const root = page.locator('label').filter({ hasText: labelRe }).nth(nth).locator('xpath=..')
  await root.locator('button').first().click()
  if (search) await root.locator('input[placeholder="Search..."]').fill(search)
  await root.locator('div.absolute button').filter({ hasText: optionText }).first().click()
}
const stepBtn = (i) => page.locator('div.overflow-x-auto.border.border-ink\\/25.bg-card button').nth(i)
const gotoStep = async (i) => { await stepBtn(i).click(); await page.waitForTimeout(150) }
// BookingForm/BLForm keep every file input mounted at once (CSS-hidden by
// step, not unmounted — see the merge design), so a bare `input[type=file]`
// selector is ambiguous once more than one section is in the DOM. Each file
// field is two SIBLING <label>s — a plain caption, then the clickable
// file-picker wrapper holding the actual (visually hidden) input — so find
// the caption by its text, then its very next sibling label's input.
const fileInputNear = (labelRe) =>
  page.locator('label').filter({ hasText: labelRe }).locator('xpath=following-sibling::label[1]').locator('input[type="file"]')
// Playwright locators don't auto-retry a plain .isEnabled()/.isDisabled()
// read — poll briefly so a render that lands a beat after a save doesn't
// read as a false negative.
async function waitUntil(fn, { timeout = 8000, interval = 200 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await fn()) return true
    await page.waitForTimeout(interval)
  }
  return false
}
// Click a Save button and wait for its OWN PUT's response — not for a
// "saved" toast. Toasts auto-dismiss after 4s (Toast.jsx), and this page has
// two independent Save buttons (Booking / B&L) that can each fire more than
// once in a test run — a still-visible toast from an EARLIER save of the
// same kind satisfies a text-based wait immediately, letting the script read
// back the API before the NEW save has actually landed. Waiting on the
// specific in-flight request/response is the only robust signal.
// Precise path match, not substring — the B&L save's URL
// (.../bookings/:id/bl) would otherwise also satisfy a plain
// "includes('/export/bookings/')" check for the Booking save.
const isBookingSaveUrl = (url) => /\/export\/bookings\/[0-9a-f]{24}$/.test(new URL(url).pathname)
const isBlSaveUrl = (url) => /\/export\/bookings\/[0-9a-f]{24}\/bl$/.test(new URL(url).pathname)
async function saveAndWait(buttonName, urlTest) {
  const [, res] = await Promise.all([
    page.waitForRequest((r) => urlTest(r.url()) && r.method() === 'PUT', { timeout: 15000 }),
    page.waitForResponse((r) => urlTest(r.url()) && r.request().method() === 'PUT', { timeout: 15000 }),
    page.getByRole('button', { name: buttonName }).click(),
  ])
  // The PUT resolving is not the end of the story: the page's onSubmit
  // handler still does `await reload()` (2 more GETs) and then bumps that
  // form's own save-generation counter, remounting it from fresh server
  // data. That remount is what a real user's next edit could otherwise
  // land on the about-to-be-discarded pre-remount instance and lose —
  // give it a moment to actually land before the next interaction.
  await page.waitForTimeout(400)
  return res
}
const saveBooking = () => saveAndWait('Save Booking details', isBookingSaveUrl)
const saveBl = () => saveAndWait('Save B&L details', isBlSaveUrl)

let jobId = null
const seedIds = { bookingIds: [], containerIds: [], roleIds: [], userIds: [], partyIds: [], agentIds: [], quotationIds: [], customerIds: [], voIds: [], vesselIds: [], quotationNos: [] }
let db
try {
  // ─── 1. Login ────────────────────────────────────────────────────────
  await page.goto(`${WEB}/login`)
  await page.locator('input[type="email"]').fill(process.env.ADMIN_EMAIL)
  await page.locator('input[type="password"], input[type="text"]').last().fill(process.env.ADMIN_DEFAULT_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {})
  check('UI login succeeds', !page.url().includes('/login'), page.url())

  const list = async (p) => (await api('GET', p)).json?.data || []
  const ports = await list('/master/ports')
  const types = await list('/master/container-types')
  const nvoccs = await list('/master/nvoccs')
  const depots = await list('/master/depots')
  const t20 = types.find((t) => t.code === '20DC')
  const nvocc = nvoccs[0], depot = depots[0]

  // Parties / POD agent the Job form picks from (Parties master data)
  const mkParty = async (partyType, name, country, taxNumber) => {
    const res = await api('POST', '/master/parties', { partyType, name: `${RUN} ${name}`, country, taxNumber, address: `${name} street`, contacts: [{ name: `${name} contact`, email: `${name.toLowerCase().replace(/\W/g, '')}@example.com`, phone: '+2010000' + name.length }] })
    if (res.json?.data?._id) seedIds.partyIds.push(res.json.data._id)
    return res.json?.data
  }
  const shipperParty = await mkParty('shipper', 'Shipper Co', 'Egypt', 'TAX-EXP-1')
  const consigneeParty = await mkParty('consignee', 'Consignee Co', 'Germany', 'TAX-IMP-1')
  const notifyParty = await mkParty('notify', 'Notify Co', 'France', 'TAX-NTF-1')
  const agentRes = await api('POST', '/master/agents', { name: `${RUN} POD Agent`, country: 'Germany', address: 'Agent road', contacts: [{ name: 'Agent Contact', email: 'agent@example.com', phone: '+4900' }] })
  if (agentRes.json?.data?._id) seedIds.agentIds.push(agentRes.json.data._id)
  check('seeded shipper / consignee / notify parties and a POD agent', !!(shipperParty && consigneeParty && notifyParty && agentRes.json?.data), JSON.stringify(agentRes.json))

  // ─── 2. Create a new booking through the real create form (5-step bar) ─
  await page.goto(`${WEB}/export/bookings/new`)
  await page.getByText('Shipping Declaration').waitFor({ timeout: 90000 })
  const createLabels = await page.locator('div.overflow-x-auto.border.border-ink\\/25.bg-card button').allTextContents()
  check('create page shows the same 5-step bar as the details page', createLabels.length === 5 && createLabels.join('|').includes('Preliminary') && createLabels.join('|').includes('BL & Loading List'), JSON.stringify(createLabels))
  check('create page starts on step 1 (cargo visible, client identity hidden)',
    await page.getByText('Shipment & Cargo').isVisible() && !(await page.getByText('Header & Job Info').isVisible()))

  // Step 1 field order and the removed fields
  const step1Labels = (await page.locator('label').allTextContents()).map((t) => t.replace(/\s*\*$/, '').trim())
  const idx = (re) => step1Labels.findIndex((t) => re.test(t))
  const order = [/^Shipping Declaration/, /^Port of Loading/, /^Port of Discharge/, /^Container Type/, /^Commodity/, /^HS Code/, /^UCR Number/, /^No\. of Packages/, /^Package Type/, /^Gross Weight/, /^Net Weight/].map(idx)
  check('Shipment & Cargo order: declaration, POL, POD, containers, commodity, HS code, UCR, packages, package type, gross, net', order.every((v, i) => v > -1 && (i === 0 || v > order[i - 1])), JSON.stringify(order))
  check('VGM, CBM, the old DG number and Container Location inputs are gone', !step1Labels.some((t) => /^VGM \(kg\)|^CBM|^Dangerous Goods Number|^Container Location|^B\/L No/.test(t)), step1Labels.join('|'))
  const partyOrder = [/^POD Agent \(/, /^Shipper \(/, /^Consignee \(/, /^Notify \(/].map(idx)
  check('Parties order: POD agent first, then shipper, consignee, notify', partyOrder.every((v, i) => v > -1 && (i === 0 || v > partyOrder[i - 1])), JSON.stringify(partyOrder))
  check('Consignee Contact preview and the POL/POD Agents section are gone', !(await page.getByText('Consignee Contact').count()) && !(await page.getByText('POL Agent').count()))
  check('Package Type is a master-data dropdown (not free text)', (await fieldInput(/^Package Type/).count()) === 0 && (await page.locator('label', { hasText: /^Package Type/ }).locator('xpath=..').locator('button').count()) > 0)

  // Steps 4/5 on create: booking-owned blocks render, B&L blocks are replaced by a note
  await gotoStep(3)
  check('create step 4 shows Customs (Nafeza) and the "unlock once the job is created" note, no B&L form',
    await page.getByText('Customs (Nafeza)').isVisible() && await page.getByText(/unlock once the job is created/).isVisible() && (await page.getByText('Customs Certificate', { exact: true }).count()) === 0)
  await gotoStep(4)
  check('create step 5 shows Status & Notes and the unlock note', await page.getByText('Status & Notes').isVisible() && await page.getByText(/unlock once the job is created/).isVisible())

  // Submitting an empty form from step 5 must not POST, and must jump to the earliest step with an error (step 1)
  let postFired = false
  const onReq = (r) => { if (r.method() === 'POST' && /\/export\/bookings$/.test(new URL(r.url()).pathname)) postFired = true }
  page.on('request', onReq)
  await page.getByRole('button', { name: 'Create booking' }).click()
  await page.waitForTimeout(500)
  page.off('request', onReq)
  check('empty submit from step 5 sends no request', !postFired)
  check('...and jumps back to step 1 showing the port error', await vis(page.getByText('Port of loading is required'), 3000))
  check('...step 1 is now the visible step', await page.getByText('Shipment & Cargo').isVisible() && !(await page.getByText('Status & Notes').isVisible()))

  // Step 1: cargo
  await pick(/^Port of Loading/, ports[0].code)
  await pick(/^Port of Discharge/, ports[1].code)
  await fieldInput(/^Commodity/).fill(RUN + ' commodity')
  // Dangerous goods round-trip, through the actual toggle buttons
  await page.getByRole('button', { name: 'Yes', exact: true }).click()
  await fieldInput(/^Class Number/).fill('3')
  await fieldInput(/^UN Number/).fill('UN1234')
  check('Dangerous Goods shows Class Number + UN Number inputs', (await fieldInput(/^Class Number/).inputValue()) === '3')
  await page.getByRole('button', { name: 'No', exact: true }).click() // toggle back off before submit — both numbers should be dropped server-side
  await fileInputNear(/^Shipping Declaration/).setInputFiles(PNG_PATH)

  // Containers are on step 1 for a job without a quotation; client identity (step 2) still empty -> submit must jump to step 2
  await page.locator('button', { hasText: 'Select container type' }).first().click()
  await page.locator('div.absolute button', { hasText: '20DC' }).first().click()
  await page.locator('input[placeholder="Qty"]').first().fill('2')
  await page.getByRole('button', { name: 'Create booking' }).click()
  check('client fields missing -> submit jumps to step 2 with the client-name error', await vis(page.getByText('Client name is required'), 3000) && await page.getByText('Header & Job Info').isVisible())

  await fieldInput(/^Client Name/).fill(RUN + ' Client')
  await fieldInput(/^Client Phone/).fill('+20100000000')
  await fieldInput(/^Client Email/).fill('e2e@example.com')
  await gotoStep(0)
  check('values typed on other steps survive switching steps', (await fieldInput(/^Commodity/).inputValue()) === RUN + ' commodity')
  await gotoStep(4)
  await fieldInput(/^Notes$/).fill('E2E create-time note')

  await page.getByRole('button', { name: 'Create booking' }).click()
  await page.waitForURL(/\/export\/bookings\/[0-9a-f]{24}$/, { timeout: 30000 }).catch(() => {})
  jobId = jobIdFrom(page.url())
  check('create redirects to the merged Booking & Job Details page', !!jobId, page.url())
  const created = (await api('GET', `/export/bookings/${jobId}`)).json?.data
  check('created booking has an auto-generated jobNo and our fields', /^OPS Jobs \d{4} FLOW MARINE/.test(created?.jobNo || ''), created?.jobNo)
  check('fields from steps 1, 2, 3 and 5 all landed in one create submission', created?.clientName === RUN + ' Client' && created?.commodity === RUN + ' commodity' && created?.containers?.[0]?.quantity === 2 && created?.notes === 'E2E create-time note', JSON.stringify([created?.clientName, created?.commodity, created?.containers, created?.notes]))
  check('class + UN number dropped server-side after toggling back off in the same submission', created?.isDangerous === false && !created?.dangerousClass && !created?.unNumber, JSON.stringify([created?.isDangerous, created?.dangerousClass, created?.unNumber]))
  check('shipping declaration file attached', created?.shippingDeclaration?.fileName === 'tiny.png', created?.shippingDeclaration?.fileName)

  // ─── 3. Step bar + Step 1 edits persist ────────────────────────────────
  await page.getByText('Shipment & Cargo').waitFor({ timeout: 60000 })
  const stepLabels = await page.locator('div.overflow-x-auto.border.border-ink\\/25.bg-card button').allTextContents()
  check('step bar shows the 5 fixed steps in order', stepLabels.length === 5 && stepLabels.join('|').includes('Preliminary') && stepLabels.join('|').includes('BL & Loading List'), JSON.stringify(stepLabels))

  await fieldInput(/^HS Code/).fill('0207.14')
  await pick(/^POD Agent \(/, `${RUN} POD Agent`)
  await pick(/^Shipper \(/, `${RUN} Shipper Co`)
  await pick(/^Consignee \(/, `${RUN} Consignee Co`)
  check('picking parties fills Exporter Tax No. (shipper) and Importer Tax No. + Country (consignee), read-only',
    (await page.getByText('TAX-EXP-1').count()) > 0 && (await page.getByText('TAX-IMP-1').count()) > 0 && (await fieldInput(/^Importer Country/).count()) === 0)
  await page.getByText('Notify is the same as the Consignee').click()
  await saveBooking()
  let afterSave = (await api('GET', `/export/bookings/${jobId}`)).json?.data
  check('Step-1 edits (HS Code, parties, POD agent) persisted', afterSave?.hsCode === '0207.14' && afterSave?.shipper?.name === `${RUN} Shipper Co` && afterSave?.consignee?.name === `${RUN} Consignee Co` && afterSave?.podAgentRef === agentRes.json.data._id && afterSave?.podAgent?.name === `${RUN} POD Agent`, JSON.stringify([afterSave?.hsCode, afterSave?.shipper?.name, afterSave?.podAgent?.name]))
  check('exporter = shipper, importer = consignee: tax numbers + country derived from the picked parties', afterSave?.exportTaxNumber === 'TAX-EXP-1' && afterSave?.importTaxNumber === 'TAX-IMP-1' && afterSave?.importCountry === 'Germany', JSON.stringify([afterSave?.exportTaxNumber, afterSave?.importTaxNumber, afterSave?.importCountry]))
  check('"Notify same as Consignee" copies the consignee into notify', afterSave?.notifySameAsConsignee === true && afterSave?.notify?.name === `${RUN} Consignee Co`, JSON.stringify([afterSave?.notifySameAsConsignee, afterSave?.notify?.name]))
  await page.getByText('Notify is the same as the Consignee').click() // untick -> pick a different notify party
  await pick(/^Notify \(/, `${RUN} Notify Co`)
  await saveBooking()
  afterSave = (await api('GET', `/export/bookings/${jobId}`)).json?.data
  check('a different notify party can be picked once the checkbox is cleared', afterSave?.notifySameAsConsignee === false && afterSave?.notify?.name === `${RUN} Notify Co` && afterSave?.consignee?.name === `${RUN} Consignee Co`, JSON.stringify([afterSave?.notifySameAsConsignee, afterSave?.notify?.name]))

  // ─── 4. Step 2: Booking — job identity, carrier, commercial, agents ───
  await gotoStep(1)
  check('step 2 shows Header/Client, Carrier Booking Confirmation and Commercial, and no Agents section', await page.getByText('Carrier Booking Confirmation').isVisible() && await page.getByText('Commercial').isVisible() && (await page.getByRole('heading', { name: 'Agents' }).count()) === 0)
  check('ETD label shows the POL and ETA label shows the POD', (await page.locator('label', { hasText: /^ETD/ }).first().textContent()).includes(ports[0].code) && (await page.locator('label', { hasText: /^ETA/ }).first().textContent()).includes(ports[1].code))
  await pick(/^Carrier$/, nvocc.code)
  await fieldInput(/^Price$/).fill('500')
  await saveBooking()

  // ─── 5. Step 3: Depot / Container — required before Confirm ───────────
  await gotoStep(2)
  check('step 3 shows the container rows only (not Carrier Booking Confirmation), and no Container Location', await page.getByText('Containers — type, container number (auto from stock), seal').isVisible() && !(await page.getByText('Carrier Booking Confirmation').isVisible()) && (await page.locator('label', { hasText: /Container Location/ }).count()) === 0)
  const confirmBtnDisabled = page.getByRole('button', { name: 'Confirm', exact: true })
  check('Confirm is disabled with no depot yet', await confirmBtnDisabled.isDisabled())
  // Seed stock so Confirm has something to allocate (2x 20DC selected above).
  // Diff before/after so cleanup can delete exactly these units — never
  // assume this (type, nvocc, depot) triple started empty.
  const stockAt = () => api('GET', `/master/containers?containerType=${t20._id}&nvocc=${nvocc._id}&depot=${depot._id}`).then((r) => r.json?.data || [])
  const beforeSeedIds = new Set((await stockAt()).map((u) => u._id))
  const seedRes = await api('POST', '/master/containers/quick-add', { containerType: t20._id, nvocc: nvocc._id, depot: depot._id, quantity: 2 })
  check('seeded 2 units of 20DC stock for this booking\'s NVOCC/Depot', seedRes.status === 201, JSON.stringify(seedRes.json))
  seedIds.containerIds.push(...(await stockAt()).filter((u) => !beforeSeedIds.has(u._id)).map((u) => u._id))

  await page.reload()
  await gotoStep(2)
  await pick(/^Depot$/, depot.code)
  const freeAsc = (await stockAt()).filter((u2) => u2.status === 'available').sort((x, y) => new Date(x.createdAt) - new Date(y.createdAt))
  const autoRows = page.locator('[data-testid="slot-type"]')
  await autoRows.first().waitFor({ timeout: 15000 })
  const typeCells = await autoRows.allTextContents()
  check('Depot step has one row per container (2 rows), each showing its own type even though the type is the same', typeCells.length === 2 && typeCells.every((t) => t.trim() === '20DC'), JSON.stringify(typeCells))
  const scrollBox = page.getByTestId('container-scroll')
  check('the containers table sits in a vertically scrolling box with a max height', (await scrollBox.evaluate((el) => { const c = getComputedStyle(el); return c.overflowY === 'auto' && c.maxHeight !== 'none' })))
  await waitUntil(async () => (await page.locator('[data-testid="auto-container"]').first().textContent()) !== 'No free stock')
  const shown = await page.locator('[data-testid="auto-container"]').allTextContents()
  check('the container numbers are auto-selected: the oldest free stock first, in order', shown.length === 2 && shown[0] === freeAsc[0].containerNumber && shown[1] === freeAsc[1].containerNumber, JSON.stringify([shown, freeAsc.slice(0, 2).map((x) => x.containerNumber)]))
  check('the container list is view-only (no select / button to choose a number)', (await page.locator('[data-testid="container-scroll"] select, [data-testid="container-scroll"] button').count()) === 0)
  const sealInputs = page.locator('[data-testid="container-scroll"]').getByLabel('Seal number')
  await sealInputs.nth(0).fill('SEAL-PICK-1')
  await sealInputs.nth(1).fill('SEAL-PICK-2')
  await saveBooking()
  const savedPick = (await api('GET', `/export/bookings/${jobId}`)).json?.data
  check('the seals are saved on the booking (nothing reserved until confirm)', savedPick?.containerAssignments?.length === 2 && savedPick.containerAssignments[0].sealNumber === 'SEAL-PICK-1' && (await stockAt()).filter((x) => x.status === 'available').length >= 2, JSON.stringify(savedPick?.containerAssignments))
  check('Confirm becomes enabled once a depot is set and saved', await waitUntil(() => page.getByRole('button', { name: 'Confirm', exact: true }).isEnabled()))

  // ─── 6. Confirm via the header action ──────────────────────────────────
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm Booking' }).click()
  await toastShown(page, /Booking confirmed/)
  check('DB status flips to confirmed', (await api('GET', `/export/bookings/${jobId}`)).json?.data?.status === 'confirmed')
  await page.reload()
  await gotoStep(2)
  await vis(page.getByText('Allocated Containers — Fulfillment'))
  // AllocatedContainersPanel fetches its rows via its own separate effect
  // (stockApi.getContainers), a beat after the "Allocated Containers —
  // Fulfillment" heading itself renders — poll rather than a one-shot read.
  check('Allocated Containers panel shows 2 units after confirm', await waitUntil(async () => (await page.locator('table tbody tr').count()) === 2))
  const heldNow = ((await api('GET', `/master/containers?booking=${jobId}`)).json?.data || []).sort((x, y) => new Date(x.createdAt) - new Date(y.createdAt))
  check('confirm allocated exactly the displayed oldest units, with the seals in order', heldNow.length === 2 && heldNow[0].containerNumber === freeAsc[0].containerNumber && heldNow[0].sealNumber === 'SEAL-PICK-1' && heldNow[1].sealNumber === 'SEAL-PICK-2', JSON.stringify(heldNow.map((x) => [x.containerNumber, x.sealNumber])))
  // Edit one unit's fulfillment fields inline and save
  await page.locator('table tbody tr').first().locator('input').first().fill('SEAL-UI-1')
  await page.locator('table tbody tr').first().getByRole('button', { name: 'Save' }).click()
  await page.waitForTimeout(500)
  const allocated = (await api('GET', `/master/containers?booking=${jobId}`)).json?.data || []
  check('per-unit fulfillment field saved from the UI', allocated.some((u) => u.sealNumber === 'SEAL-UI-1'), JSON.stringify(allocated.map((u) => u.sealNumber)))

  // ─── 7. Step 4: Nafeza (booking) + Customs Certificate (B&L) side by side ─
  await gotoStep(3)
  check('step 4 shows Customs (Nafeza), Job Context and Customs Certificate together', await page.getByText('Customs (Nafeza)').isVisible() && await page.getByText('Job Context').isVisible() && await page.getByText('Customs Certificate').isVisible())
  await page.getByText('Shipping permit submitted on Nafeza').click()
  await saveBooking()
  check('Nafeza submission auto-stamps Submitted At (server-set)', !!(await api('GET', `/export/bookings/${jobId}`)).json?.data?.customsSubmittedAt)

  await fieldInput(/^El-Harka Representative Name/).fill('E2E Rep')
  await fileInputNear(/^Certificate Upload/).setInputFiles(PNG_PATH)
  await saveBl()
  const blAfterStep4 = (await api('GET', `/export/bookings/${jobId}/bl`)).json?.data
  check('B&L Customs Certificate fields saved independently of the Booking form', blAfterStep4?.elHarkaRepName === 'E2E Rep' && blAfterStep4?.customsCertificateFile?.fileName === 'tiny.png', JSON.stringify([blAfterStep4?.elHarkaRepName, blAfterStep4?.customsCertificateFile]))
  const bookingUnchangedByBlSave = (await api('GET', `/export/bookings/${jobId}`)).json?.data
  check('Booking-side price untouched by the B&L-only save', bookingUnchangedByBlSave?.price === 500, bookingUnchangedByBlSave?.price)

  // ─── 8. Step 5: Status & Notes (booking) + BL Parties/Release/Closure/FollowUp ─
  await gotoStep(4)
  check('step 5 shows Status & Notes plus every BL section', await page.getByText('Status & Notes').isVisible() && await page.getByText('BL Parties & Draft BL').isVisible() && await page.getByText('BL Release').isVisible() && await page.getByText('Sea/Customs Closure').isVisible() && await page.getByText('Final Follow-up & Closing').isVisible())
  check('Sea/Customs Closure is locked (no ATD set yet)', (await page.getByText(/unlocks once the Actual Time of Departure/).count()) > 0)

  await fieldInput(/^Notes$/).fill('E2E step-5 note')
  await saveBooking()
  // Deliberately no artificial wait here: a Booking-only save must NOT
  // remount BLForm (page.jsx keys each form off its own independent
  // save-generation counter, not the shared document updatedAt) — typing
  // into BL fields immediately after this save is exactly what would have
  // raced and lost input before that fix (and before saveBooking() replaced
  // toast-text matching, which could also resolve on an already-visible
  // toast from step 4's earlier B&L save and let the script race ahead of
  // its own new save).
  await fieldInput(/^HBL Number/).fill('HBL-UI-1')
  // POD Agent Update Log — add one entry. Several other date inputs are
  // visible on this same step (Draft Sent to Client / Telex / Date of Issue
  // / Customer Notified) so `.last()` is not reliable here — the date input
  // is the note input's immediate preceding sibling in the JSX.
  const podNoteInput = page.locator('input[placeholder="Update note"]')
  await podNoteInput.locator('xpath=preceding-sibling::input[@type="date"]').fill('2026-10-05')
  await podNoteInput.fill('first UI update')
  await page.getByRole('button', { name: '+ Add', exact: true }).click()
  await saveBl()
  const blAfterStep5 = (await api('GET', `/export/bookings/${jobId}/bl`)).json?.data
  check('Step-5 B&L fields (HBL Number, POD agent log entry) saved', blAfterStep5?.hblNumber === 'HBL-UI-1' && blAfterStep5?.podAgentUpdateLog?.some((e) => e.note === 'first UI update'), JSON.stringify(blAfterStep5?.podAgentUpdateLog))
  check('Step-5 Booking field (Notes) saved independently', (await api('GET', `/export/bookings/${jobId}`)).json?.data?.notes === 'E2E step-5 note')

  await page.screenshot({ path: fileURLToPath(new URL(`./shots/${RUN}-step5.png`, import.meta.url)), fullPage: true })

  // ─── 9. Cancel (restores stock) then Delete, via header actions ───────
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel Booking' }).click()
  await toastShown(page, /Booking cancelled/)
  check('DB status flips to cancelled and stock is released', (await api('GET', `/export/bookings/${jobId}`)).json?.data?.status === 'cancelled')
  const releasedUnits = (await api('GET', `/master/containers?booking=${jobId}`)).json?.data || []
  check('cancel released the allocated units (none linked to this booking anymore)', releasedUnits.length === 0, JSON.stringify(releasedUnits))

  await page.locator('button[title="Delete booking"]').click()
  await page.getByRole('button', { name: 'Delete Booking', exact: true }).click()
  await page.waitForURL((u) => u.pathname === '/export/bookings', { timeout: 15000 }).catch(() => {})
  const afterDelete = await api('GET', `/export/bookings/${jobId}`)
  check('delete worked and redirected to the list', afterDelete.status === 404 && page.url().endsWith('/export/bookings'), `${afterDelete.status} ${page.url()}`)
  jobId = null

  // ─── 9b. Convert an approved quotation: its data is shown read-only ────
  const qCustomer = await api('POST', '/master/customers', { name: `${RUN} QClient`, phone: '+20155', email: 'qclient@example.com' })
  seedIds.customerIds.push(qCustomer.json.data._id)
  const vo = await api('POST', '/master/vessel-operators', { name: `${RUN} VO`, code: `${RUN}-VO`, contacts: [{ name: 'VO Alice', phone: '+2001' }, { name: 'VO Bob', phone: '+2002' }] })
  seedIds.voIds.push(vo.json.data._id)
  const otherVo = await api('POST', '/master/vessel-operators', { name: `${RUN} VO2`, code: `${RUN}-V2` })
  seedIds.voIds.push(otherVo.json.data._id)
  const vessel = await api('POST', '/master/vessels', { vesselOperator: vo.json.data._id, name: `${RUN} MV Alpha` })
  seedIds.vesselIds.push(vessel.json.data._id)
  const otherVessel = await api('POST', '/master/vessels', { vesselOperator: otherVo.json.data._id, name: `${RUN} MV Other` })
  seedIds.vesselIds.push(otherVessel.json.data._id)

  const qRes = await api('POST', '/export/quotations', {
    customerType: 'existing', customer: qCustomer.json.data._id, clientName: `${RUN} QClient`, contactPerson: 'Q Contact', contactPhone: '+20155', contactEmail: 'qclient@example.com',
    salesRep: 'E2E', commodity: `${RUN} QCommodity`, hsCode: '1234.56', pol: ports[0]._id, pod: ports[1]._id,
    containers: [{ containerType: t20._id, quantity: 2, grossWeight: 2000, netWeight: 1800 }],
    isDangerous: true, unNumber: 'UN1203', nvocc: nvocc._id, paymentTerms: 'Freight Prepaid', freeTimeBuyingDays: 7,
    buyingOrigin: { oceanFreight: { rate20: 100, currency: 'USD' } }, sellingOrigin: { oceanFreight: { rate20: 150, currency: 'USD' } },
  })
  const qId = qRes.json?.data?._id
  if (qId) { seedIds.quotationIds.push(qId); seedIds.quotationNos.push(qRes.json.data.quotationNo) }
  check('quotation for the convert flow created', qRes.status === 201, JSON.stringify(qRes.json))
  const msdsUp = await context.request.post(API + `/export/quotations/${qId}/msds`, { multipart: { msds: { name: 'msds-sheet.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') } } })
  check('MSDS file attached to the quotation', msdsUp.status() === 201, msdsUp.status())
  await api('PUT', `/export/quotations/${qId}/status`, { status: 'sent' })
  const approved = await api('PUT', `/export/quotations/${qId}/status`, { status: 'approved' })
  check('quotation sent + approved', approved.json?.data?.status === 'approved', JSON.stringify(approved.json))

  await page.goto(`${WEB}/export/bookings/new?fromQuotation=${qId}`)
  await page.getByText('Shipment & Cargo').waitFor({ timeout: 90000 })
  check('container types come from the quotation, as text', await page.getByText('20DC × 2').isVisible() && (await page.locator('label', { hasText: /^Container Type/ }).count()) === 0)
  check('commodity + HS code + gross/net weights are pre-filled from the quotation', (await hasValue(page, `${RUN} QCommodity`)) && (await hasValue(page, '1234.56')) && (await hasValue(page, '2000')) && (await hasValue(page, '1800')))
  check('Dangerous Goods is shown read-only with the quotation\'s UN number', await page.getByText('UN1203').first().isVisible() && (await page.locator('label', { hasText: /^UN Number/ }).count()) === 0)
  check('DG attachment (MSDS) from the quotation is listed', await page.getByRole('button', { name: 'msds-sheet.png' }).isVisible())
  const [msdsDl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.getByRole('button', { name: 'msds-sheet.png' }).click()])
  check('the DG attachment downloads', msdsDl.suggestedFilename() === 'msds-sheet.png', msdsDl.suggestedFilename())
  await fieldInput(/^Class Number/).fill('3')

  await gotoStep(1)
  check('client name / phone / email are view-only (no inputs) and show the quotation\'s client',
    (await page.locator('label', { hasText: /^Client (Name|Phone|Email)/ }).count()) === 0 && (await page.getByText(`${RUN} QClient`).first().isVisible()) && (await page.getByText('qclient@example.com').first().isVisible()))
  check('Commercial is view-only: carrier, currency, price, cost and free time (7 days) from the quotation',
    (await page.locator('label', { hasText: /^(Price|Cost|Currency)$/ }).count()) === 0 && (await page.getByText('7 days').isVisible()) && (await page.getByText('300', { exact: true }).count()) > 0)
  check('ETD/ETA labels carry the quotation\'s POL / POD', (await page.locator('label', { hasText: /^ETD/ }).first().textContent()).includes(ports[0].code) && (await page.locator('label', { hasText: /^ETA/ }).first().textContent()).includes(ports[1].code))
  check('no B/L No input on the Carrier Booking Confirmation section', (await page.locator('label', { hasText: /^B\/L No/ }).count()) === 0)

  // VO -> vessel list (only that VO's vessels) and VO contact person (that VO's contacts)
  await pick(/^Vessel Operator/, `${RUN}-VO`)
  const vesselRoot = page.locator('label', { hasText: /^Vessel Name/ }).locator('xpath=..')
  await vesselRoot.locator('button').first().click()
  const vesselOpts = await vesselRoot.locator('div.absolute button').allTextContents()
  check('Vessel Name is a master-data list filtered by the chosen VO', vesselOpts.some((t) => t.includes('MV Alpha')) && !vesselOpts.some((t) => t.includes('MV Other')), vesselOpts.join('|'))
  await vesselRoot.locator('div.absolute button').filter({ hasText: 'MV Alpha' }).first().click()
  const contactRoot = page.locator('label', { hasText: /^VO Contact Person/ }).locator('xpath=..')
  await contactRoot.locator('button').first().click()
  const contactOpts = await contactRoot.locator('div.absolute button').allTextContents()
  check('VO Contact Person lists the chosen VO\'s contacts from master data', contactOpts.some((t) => t.includes('VO Alice')) && contactOpts.some((t) => t.includes('VO Bob')), contactOpts.join('|'))
  await contactRoot.locator('div.absolute button').filter({ hasText: 'VO Bob' }).first().click()

  await page.getByRole('button', { name: 'Create booking' }).click()
  await page.waitForURL(/\/export\/bookings\/[0-9a-f]{24}$/, { timeout: 30000 }).catch(() => {})
  const convJobId = jobIdFrom(page.url())
  if (convJobId) seedIds.bookingIds.push(convJobId)
  const conv = (await api('GET', `/export/bookings/${convJobId}`)).json?.data
  check('converted booking is linked to the quotation and carries its data (client, DG, weights, price)',
    conv?.quotation?.quotationNo === qRes.json.data.quotationNo && conv?.clientName === `${RUN} QClient` && conv?.isDangerous === true && conv?.unNumber === 'UN1203' && conv?.dangerousClass === '3' && conv?.grossWeight === 2000 && conv?.netWeight === 1800 && conv?.price === 300,
    JSON.stringify([conv?.quotation?.quotationNo, conv?.unNumber, conv?.dangerousClass, conv?.grossWeight, conv?.netWeight, conv?.price]))
  check('VO, vessel and VO contact person saved', conv?.carrier?._id === vo.json.data._id && conv?.vesselName === `${RUN} MV Alpha` && conv?.voContactPerson === 'VO Bob', JSON.stringify([conv?.carrier?._id, conv?.vesselName, conv?.voContactPerson]))
  check('the booking\'s quotation reference carries the MSDS file list (for the DG attachments)', conv?.quotation?.msdsFiles?.[0]?.fileName === 'msds-sheet.png', JSON.stringify(conv?.quotation))
  const msdsViaBooking = await context.request.get(API + `/export/bookings/${convJobId}/msds/${conv?.quotation?.msdsFiles?.[0]?._id}`)
  check('booking:read users can download the DG attachment through the booking', msdsViaBooking.status() === 200, msdsViaBooking.status())
  await page.getByText('Shipment & Cargo').waitFor({ timeout: 60000 })
  check('on the saved job the client and commercial data stay view-only', (await page.locator('label', { hasText: /^Client Name/ }).count()) === 0 && (await page.getByRole('button', { name: 'msds-sheet.png' }).isVisible()))

  // ─── 10. List page: filters, pagination, quick create ──────────────────
  const listBookings = []
  for (const suffix of ['alpha', 'beta']) {
    const res = await api('POST', '/export/bookings', {
      clientName: `${RUN} ${suffix}`, clientPhone: '+20100000000', clientEmail: 'e2e@example.com',
      pol: ports[0]._id, pod: ports[1]._id, commodity: 'list filter test',
      containers: [{ containerType: t20._id, quantity: 1 }],
    })
    listBookings.push(res.json.data._id)
  }
  seedIds.bookingIds.push(...listBookings)

  await page.goto(`${WEB}/export/bookings`)
  await page.getByPlaceholder('Search job no / client / B-L').fill(RUN)
  await page.getByText(`${RUN} alpha`).first().waitFor({ timeout: 30000 }).catch(() => {})
  check('list search finds both newly created bookings', (await page.locator('tbody tr').filter({ hasText: RUN }).filter({ hasText: /alpha|beta/ }).count()) === 2)
  // This filter Select has no `label` prop (just a bare placeholder button),
  // unlike the labeled form fields `pick()` targets elsewhere in this file.
  await page.locator('button', { hasText: 'All Statuses' }).click()
  await page.locator('div.absolute button', { hasText: 'Pending' }).first().click()
  check('status=Pending filter still shows both (both pending)', await waitUntil(async () => (await page.locator('tbody tr').filter({ hasText: RUN }).filter({ hasText: /alpha|beta/ }).count()) === 2))
  await page.screenshot({ path: fileURLToPath(new URL(`./shots/${RUN}-list.png`, import.meta.url)), fullPage: true })

  // ─── 11. Preview page + Excel export ───────────────────────────────────
  await page.goto(`${WEB}/export/preview`)
  await page.getByPlaceholder('Search job no / client').fill(RUN)
  check('preview page shows a summary header and the filtered rows', await waitUntil(async () =>
    (await page.getByText('Export Excel').isVisible().catch(() => false)) && (await page.locator('table tbody tr').count()) >= 1
  ))
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.getByRole('button', { name: 'Export Excel' }).click(),
  ])
  check('Export Excel triggers a real .xlsx download', /export-bookings-.*\.xlsx$/.test(download.suggestedFilename()), download.suggestedFilename())

  // ─── 12. Sidebar shows one "Booking & Job" entry, no separate "B&L" ────
  const navLabels = await page.locator('nav a span').allTextContents()
  check('sidebar has exactly one "Booking & Job" entry and no "B&L" entry', navLabels.filter((t) => t.trim() === 'Booking & Job').length === 1 && !navLabels.some((t) => t.trim() === 'B&L'), JSON.stringify(navLabels))

  // ─── 13. Permission-gated UI — a bl-only role logging in for real ──────
  await mongoose.connect(process.env.MONGO_URI)
  db = mongoose.connection.db
  const roleRes = await api('POST', '/roles', { name: `${RUN}-bl-only`.toLowerCase(), permissions: ['bl:read', 'bl:update'], description: 'E2E temp role' })
  seedIds.roleIds.push(roleRes.json.data._id)
  const pass = 'E2ETestPass123!'
  const passwordHash = await hashPassword(pass)
  const blEmail = `e2e-ui-bl-only-${RUN}@example.com`.toLowerCase()
  const u = await db.collection('users').insertOne({ name: 'E2E UI BL Only', email: blEmail, passwordHash, role: new mongoose.Types.ObjectId(roleRes.json.data._id), status: 'active', createdAt: new Date(), updatedAt: new Date() })
  seedIds.userIds.push(u.insertedId.toString())

  await page.goto(`${WEB}/login`)
  await page.locator('input[type="email"]').fill(blEmail)
  await page.locator('input[type="password"], input[type="text"]').last().fill(pass)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((u2) => !u2.pathname.startsWith('/login'), { timeout: 30000 }).catch(() => {})
  check('bl-only test user logs in through the UI', !page.url().includes('/login'), page.url())
  await vis(page.locator('nav'))
  await page.waitForTimeout(300) // let the permission-filtered nav settle after AuthContext resolves

  const blNav = await page.locator('nav a span').allTextContents()
  check('bl-only user still sees "Booking & Job" in the sidebar (no separate B&L entry needed)', blNav.some((t) => t.trim() === 'Booking & Job'))
  await page.goto(`${WEB}/export/bookings`)
  await vis(page.locator('table'))
  check('bl-only user\'s "Booking & Job" list renders the B&L-style table (B/L Type column, no POL/POD)', await page.getByText('B/L Type').isVisible() && (await page.getByText('POL', { exact: true }).count()) === 0)

  await page.goto(`${WEB}/export/bookings/${listBookings[0]}`)
  await page.getByText('Shipment & Cargo', { exact: false }).first().waitFor({ timeout: 30000 }).catch(() => {})
  check('bl-only user sees "Not authorized" for Booking-owned Step 1 content', (await page.getByText('Not authorized').count()) > 0)
  await gotoStep(3)
  check('bl-only user sees the real Customs Certificate form on step 4 (their own permission)', await page.getByText('Customs Certificate').isVisible())
  check('...and a "Not authorized" note for the Booking-owned Nafeza sub-block on the same step', (await page.getByText(/booking:read/).count()) > 0)
} catch (err) {
  check('UI run completed without an unexpected error', false, err.stack || err.message)
  await page.screenshot({ path: fileURLToPath(new URL(`./shots/${RUN}-FAILURE.png`, import.meta.url)), fullPage: true }).catch(() => {})
} finally {
  const noise = /favicon|401|403/
  const real = consoleErrors.filter((e) => !noise.test(e))
  check('no browser console/page errors during the run', real.length === 0, '\n    ' + real.slice(0, 6).join('\n    '))
  await browser.close()
  try {
    if (!db) await mongoose.connect(process.env.MONGO_URI)
    db = mongoose.connection.db
    if (jobId) seedIds.bookingIds.push(jobId)
    const bookingObjIds = seedIds.bookingIds.map((id) => new mongoose.Types.ObjectId(id))
    const delBookings = bookingObjIds.length ? await db.collection('bookings').deleteMany({ _id: { $in: bookingObjIds } }) : { deletedCount: 0 }
    const delContainers = seedIds.containerIds.length
      ? await db.collection('containers').deleteMany({ _id: { $in: seedIds.containerIds.map((id) => new mongoose.Types.ObjectId(id)) } })
      : { deletedCount: 0 }
    const oid = (arr) => ({ _id: { $in: arr.map((id) => new mongoose.Types.ObjectId(id)) } })
    if (seedIds.partyIds.length) await db.collection('parties').deleteMany(oid(seedIds.partyIds))
    if (seedIds.agentIds.length) await db.collection('agents').deleteMany(oid(seedIds.agentIds))
    if (seedIds.vesselIds.length) await db.collection('vessels').deleteMany(oid(seedIds.vesselIds))
    if (seedIds.voIds.length) await db.collection('vesseloperators').deleteMany(oid(seedIds.voIds))
    if (seedIds.customerIds.length) await db.collection('customers').deleteMany(oid(seedIds.customerIds))
    if (seedIds.quotationIds.length) {
      const qs = await db.collection('quotations').find(oid(seedIds.quotationIds)).project({ msdsFiles: 1 }).toArray()
      for (const q of qs) for (const f of q.msdsFiles || []) await unlink(fileURLToPath(new URL('../../backend/uploads/msds/' + f.filePath, import.meta.url))).catch(() => {})
      await db.collection('quotations').deleteMany(oid(seedIds.quotationIds))
      // give the consumed quotation numbers back only while ours are still the tail
      const qYear = new Date().getFullYear()
      for (const no of [...seedIds.quotationNos].reverse()) {
        const res = await db.collection('jobcounters').updateOne({ _id: `quotation-${qYear}`, seq: Number(/(\d{4})$/.exec(no)?.[1]) }, { $inc: { seq: -1 } })
        if (!res.modifiedCount) break
      }
    }
    const delUsers = seedIds.userIds.length ? await db.collection('users').deleteMany({ _id: { $in: seedIds.userIds.map((id) => new mongoose.Types.ObjectId(id)) } }) : { deletedCount: 0 }
    const delRoles = seedIds.roleIds.length ? await db.collection('roles').deleteMany({ _id: { $in: seedIds.roleIds.map((id) => new mongoose.Types.ObjectId(id)) } }) : { deletedCount: 0 }
    console.log(`cleanup: removed ${delBookings.deletedCount} booking(s), ${delContainers.deletedCount} container unit(s), ${delUsers.deletedCount} user(s), ${delRoles.deletedCount} role(s)`)
    await mongoose.disconnect()
  } catch (e) { console.log('CLEANUP FAILED — remove E2E-BOOKING-UI- data by hand:', e.message) }
  const failed = results.filter((x) => !x.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed, run=${RUN}`)
  process.exitCode = failed.length ? 1 : 0
}
