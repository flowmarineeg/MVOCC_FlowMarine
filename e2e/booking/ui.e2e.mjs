// Browser E2E for the Booking & Job module (merged 5-step details page +
// its B&L content) — real Edge (playwright-core, no browser download), real
// UI on :3000, real API on :5000. Run: cd e2e && npm install && npm run
// booking:ui   (backend + frontend must be running). Creates E2E-BOOKING-UI-*
// data (bookings, container stock, two temp roles+users) and deletes it when
// done.
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'
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
const seedIds = { bookingIds: [], containerIds: [], roleIds: [], userIds: [] }
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

  // ─── 2. Create a new booking through the real create form ─────────────
  await page.goto(`${WEB}/export/bookings/new`)
  await page.getByText('Shipping Declaration').waitFor({ timeout: 90000 })
  await fieldInput(/^Client Name/).fill(`${RUN} Client`)
  await fieldInput(/^Client Phone/).fill('+20100000000')
  await fieldInput(/^Client Email/).fill('e2e@example.com')
  await pick(/^Port of Loading/, ports[0].code)
  await pick(/^Port of Discharge/, ports[1].code)
  await fieldInput(/^Commodity/).fill(`${RUN} commodity`)
  await page.locator('button', { hasText: 'Select container type' }).first().click()
  await page.locator('div.absolute button', { hasText: '20DC' }).first().click()
  await page.locator('input[placeholder="Qty"]').first().fill('2')
  // Dangerous goods round-trip, through the actual toggle buttons
  await page.getByRole('button', { name: 'Yes', exact: true }).click()
  await fieldInput(/^Dangerous Goods Number/).fill('UN1234 / Class 3')
  await page.getByRole('button', { name: 'No', exact: true }).click() // toggle back off before submit — number should be dropped server-side
  await fileInputNear(/^Shipping Declaration/).setInputFiles(PNG_PATH)

  await page.getByRole('button', { name: 'Create booking' }).click()
  await page.waitForURL(/\/export\/bookings\/[0-9a-f]{24}$/, { timeout: 30000 }).catch(() => {})
  jobId = jobIdFrom(page.url())
  check('create redirects to the merged Booking & Job Details page', !!jobId, page.url())
  const created = (await api('GET', `/export/bookings/${jobId}`)).json?.data
  check('created booking has an auto-generated jobNo and our fields', /^OPS Jobs \d{4} FLOW MARINE/.test(created?.jobNo || ''), created?.jobNo)
  check('dangerous-goods number dropped server-side after toggling back off in the same submission', created?.isDangerous === false && !created?.dangerousNumber, JSON.stringify([created?.isDangerous, created?.dangerousNumber]))
  check('shipping declaration file attached', created?.shippingDeclaration?.fileName === 'tiny.png', created?.shippingDeclaration?.fileName)

  // ─── 3. Step bar + Step 1 edits persist ────────────────────────────────
  await page.getByText('Shipment & Cargo').waitFor({ timeout: 60000 })
  const stepLabels = await page.locator('div.overflow-x-auto.border.border-ink\\/25.bg-card button').allTextContents()
  check('step bar shows the 5 fixed steps in order', stepLabels.length === 5 && stepLabels.join('|').includes('Preliminary') && stepLabels.join('|').includes('BL & Loading List'), JSON.stringify(stepLabels))

  await fieldInput(/^HS Code/).fill('0207.14')
  await fieldInput(/^Name/, 0).fill('Shipper Co') // Shipper block, first "Name" field on step 1
  await saveBooking()
  let afterSave = (await api('GET', `/export/bookings/${jobId}`)).json?.data
  check('Step-1 edits (HS Code, Shipper name) persisted', afterSave?.hsCode === '0207.14' && afterSave?.shipper?.name === 'Shipper Co', JSON.stringify([afterSave?.hsCode, afterSave?.shipper?.name]))

  // ─── 4. Step 2: Booking — job identity, carrier, commercial, agents ───
  await gotoStep(1)
  check('step 2 shows Header/Client, Carrier Booking Confirmation, Commercial, Agents', await page.getByText('Carrier Booking Confirmation').isVisible() && await page.getByText('Commercial').isVisible() && await page.getByText('Agents').isVisible())
  await pick(/^NVOCC$/, nvocc.code)
  await fieldInput(/^Price$/).fill('500')
  await saveBooking()

  // ─── 5. Step 3: Depot / Container — required before Confirm ───────────
  await gotoStep(2)
  check('step 3 shows Containers only (not Carrier Booking Confirmation)', await page.getByText('Container Type & Quantity').isVisible() && !(await page.getByText('Carrier Booking Confirmation').isVisible()))
  const confirmBtnDisabled = page.getByRole('button', { name: 'Confirm', exact: true })
  check('Confirm is disabled with no depot yet', await confirmBtnDisabled.isDisabled())
  await pick(/^Depot$/, depot.code)
  await saveBooking()
  check('Confirm becomes enabled once a depot is set and saved', await waitUntil(() => page.getByRole('button', { name: 'Confirm', exact: true }).isEnabled()))

  // Seed stock so Confirm has something to allocate (2x 20DC selected above).
  // Diff before/after so cleanup can delete exactly these units — never
  // assume this (type, nvocc, depot) triple started empty.
  const stockAt = () => api('GET', `/master/containers?containerType=${t20._id}&nvocc=${nvocc._id}&depot=${depot._id}`).then((r) => r.json?.data || [])
  const beforeSeedIds = new Set((await stockAt()).map((u) => u._id))
  const seedRes = await api('POST', '/master/containers/quick-add', { containerType: t20._id, nvocc: nvocc._id, depot: depot._id, quantity: 2 })
  check('seeded 2 units of 20DC stock for this booking\'s NVOCC/Depot', seedRes.status === 201, JSON.stringify(seedRes.json))
  seedIds.containerIds.push(...(await stockAt()).filter((u) => !beforeSeedIds.has(u._id)).map((u) => u._id))

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
  check('list search finds both newly created bookings', (await page.locator('tbody tr').filter({ hasText: RUN }).count()) === 2)
  // This filter Select has no `label` prop (just a bare placeholder button),
  // unlike the labeled form fields `pick()` targets elsewhere in this file.
  await page.locator('button', { hasText: 'All Statuses' }).click()
  await page.locator('div.absolute button', { hasText: 'Pending' }).first().click()
  check('status=Pending filter still shows both (both pending)', await waitUntil(async () => (await page.locator('tbody tr').filter({ hasText: RUN }).count()) === 2))
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
    const delUsers = seedIds.userIds.length ? await db.collection('users').deleteMany({ _id: { $in: seedIds.userIds.map((id) => new mongoose.Types.ObjectId(id)) } }) : { deletedCount: 0 }
    const delRoles = seedIds.roleIds.length ? await db.collection('roles').deleteMany({ _id: { $in: seedIds.roleIds.map((id) => new mongoose.Types.ObjectId(id)) } }) : { deletedCount: 0 }
    console.log(`cleanup: removed ${delBookings.deletedCount} booking(s), ${delContainers.deletedCount} container unit(s), ${delUsers.deletedCount} user(s), ${delRoles.deletedCount} role(s)`)
    await mongoose.disconnect()
  } catch (e) { console.log('CLEANUP FAILED — remove E2E-BOOKING-UI- data by hand:', e.message) }
  const failed = results.filter((x) => !x.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed, run=${RUN}`)
  process.exitCode = failed.length ? 1 : 0
}
