// Browser E2E for the Quotation module — real Edge (playwright-core, no browser download),
// real UI on :3000, real API on :5000.
// Run: cd e2e && npm install && npm run quotation:ui   (backend + frontend must be running)
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

// Repo-relative: e2e/quotation/ -> ../../backend/
const BACKEND = fileURLToPath(new URL('../../backend/', import.meta.url))
const imp = (p) => import(pathToFileURL(BACKEND + p).href)
const { default: dotenv } = await imp('node_modules/dotenv/lib/main.js')
dotenv.config({ path: BACKEND + '.env' })
const { default: mongoose } = await imp('node_modules/mongoose/index.js')

const WEB = process.env.WEB || 'http://localhost:3000'
const API = process.env.API || 'http://localhost:5000/api'
const RUN = `E2E-UI-${Date.now().toString(36).toUpperCase()}`
const SHOTS = new URL('./shots/', import.meta.url)
mkdirSync(SHOTS, { recursive: true })
const shot = (page, name) => page.screenshot({ path: new URL(`${RUN}-${name}.png`, SHOTS).pathname.replace(/^\//, ''), fullPage: true })

const results = []
const consoleErrors = []
const check = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + detail}`)
  return !!cond
}
const text = async (loc) => ((await loc.first().textContent({ timeout: 8000 })) || '').replace(/\s+/g, ' ').trim()

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
context.setDefaultTimeout(30000)
const page = await context.newPage()
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${m.text()} @ ${page.url()}`) })
page.on('pageerror', (e) => consoleErrors.push(`PAGEERROR ${e.message} @ ${page.url()}`))

// ─── helpers ─────────────────────────────────────────────────────────
const fieldInput = (labelRe, nth = 0) => page.locator('label').filter({ hasText: labelRe }).nth(nth).locator('xpath=..').locator('input, textarea').first()
async function pick(labelRe, optionText, { nth = 0, search } = {}) {
  const root = page.locator('label').filter({ hasText: labelRe }).nth(nth).locator('xpath=..')
  await root.locator('button').first().click()
  if (search) await root.locator('input[placeholder="Search..."]').fill(search)
  await root.locator('div.absolute button').filter({ hasText: optionText }).first().click()
}
const selectText = (labelRe, nth = 0) => text(page.locator('label').filter({ hasText: labelRe }).nth(nth).locator('xpath=..').locator('button').first())
const tbl = (title) => page.locator('h3', { hasText: title }).locator('xpath=ancestor::div[contains(@class,"space-y-3")][1]')
const row = (title, label) => tbl(title).locator('tbody tr').filter({ has: page.locator('td', { hasText: new RegExp(`^${label}$`) }) })
const cell = (title, label, i) => row(title, label).locator('input').nth(i) // 0 rate20, 1 qty20, 2 rate40, 3 qty40
const rowTotal = (title, label) => text(row(title, label).locator('td.font-semibold'))
const tableTotal = (title) => text(tbl(title).locator('tfoot td.font-bold'))
const summary = (label) => text(page.locator('p', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::p'))
const T = { bo: 'Origin Charges — Buying Rate', bd: 'Destination Charges — Buying Rate', so: 'Origin Charges — Selling Rate', sd: 'Destination Charges — Selling Rate' }
const api = async (method, path, data) => {
  const res = await context.request.fetch(API + path, { method, data, headers: { 'content-type': 'application/json' } })
  return { status: res.status(), json: await res.json().catch(() => null) }
}
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.011
const hasValue = (v, t = 60000) => page.waitForFunction((val) => [...document.querySelectorAll('input,textarea')].some((i) => i.value === val), v, { timeout: t }).then(() => true).catch(() => false)
const vis = (loc, t = 10000) => loc.first().waitFor({ state: 'visible', timeout: t }).then(() => true).catch(() => false)
const toastShown = (re) => page.getByText(re).first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false)

let qId = null
const seedIds = []
try {
  // ─── 1. Login through the real UI ───────────────────────────────────
  await page.goto(`${WEB}/login`)
  await page.locator('input[type="email"]').fill(process.env.ADMIN_EMAIL)
  await page.locator('input[type="password"], input[type="text"]').last().fill(process.env.ADMIN_DEFAULT_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {})
  check('UI login succeeds and leaves /login', !page.url().includes('/login'), page.url())

  // Master data + a seed quotation for the NVOCC rate-suggestion check
  const list = async (p) => (await api('GET', p)).json?.data || []
  const types = await list('/master/container-types'), ports = await list('/master/ports'), nvoccs = await list('/master/nvoccs')
  const t20 = types.find((t) => t.code === '20DC'), t40 = types.find((t) => t.code === '40HC')
  const nvocc = nvoccs[0]
  const seed = await api('POST', '/export/quotations', {
    quotationNo: `${RUN}-SEED`, customerType: 'new', clientName: 'E2E UI Seed', salesRep: 'E2E', commodity: 'seed', pol: ports[0]._id, pod: ports[1]._id, nvocc: nvocc._id,
    containers: [{ containerType: t20._id, quantity: 1 }, { containerType: t40._id, quantity: 1 }],
    buyingOrigin: { oceanFreight: { rate20: 111, rate40: 222 } }, buyingDestination: { dthc: { rate20: 7, rate40: 8 } },
  })
  if (seed.status === 201) seedIds.push(seed.json.data._id)
  check('seed quotation for NVOCC suggestion created', seed.status === 201, JSON.stringify(seed.json))

  // ─── 2. New quotation form: empty state + client-side validation ────
  await page.goto(`${WEB}/export/quotations/new`)
  await page.getByText('1. Client Request Data').waitFor({ timeout: 90000 })
  check('form renders all 5 sections', (await page.locator('h2').filter({ hasText: /^[1-5]\./ }).count()) === 5)
  check('empty state: each rate table explains the 20/40ft detection', (await page.getByText(/20ft \/ 40ft columns are detected automatically/).count()) === 4)
  await page.getByRole('button', { name: 'Create quotation' }).click()
  check('submitting empty form shows required-field errors, no navigation',
    (await page.getByText('Quotation number is required').count()) > 0 && (await page.getByText('Commodity is required').count()) > 0 &&
    (await page.getByText('Port of loading is required').count()) > 0 && page.url().endsWith('/new'), page.url())

  // ─── 3. Fill Section 1 (incl. the inline "New Client" modal) ────────
  await fieldInput(/Quotation No/).fill(`${RUN}-A`)
  await page.getByRole('button', { name: 'New Client', exact: true }).click()
  await page.getByRole('button', { name: '+ Create new client' }).click()
  await page.locator('label').filter({ hasText: /^Name/ }).locator('xpath=..').locator('input').fill(`E2E UI Client ${RUN}`)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  check('inline New Client modal creates a client (nested-form regression)', await vis(page.getByText('(new client)')))
  await fieldInput(/^Commodity/).fill('E2E UI Commodity')
  await pick(/^POL/, ports[0].code)
  await pick(/^POD/, ports[1].code)

  // ─── 4. Auto-detected size columns follow the selected containers ───
  await page.locator('button', { hasText: 'Select container type' }).first().click()
  await page.locator('div.absolute button', { hasText: '20DC' }).first().click()
  await page.locator('input[placeholder="Qty"]').first().fill('2')
  check('20DC selected -> "20 ft" columns appear in all 4 tables', (await page.locator('thead th', { hasText: /^20 ft$/ }).count()) === 4)
  check('20DC selected -> NO "40 ft" columns yet', (await page.locator('thead th', { hasText: /^40 ft$/ }).count()) === 0)
  check('QTY auto-detected: 20ft qty placeholder = 2', (await cell(T.bo, 'Ocean Freight', 1).getAttribute('placeholder')) === '2')

  await page.getByRole('button', { name: /Add another type/ }).click()
  await page.locator('button', { hasText: 'Select container type' }).first().click()
  await page.locator('div.absolute button', { hasText: '40HC' }).first().click()
  await page.locator('input[placeholder="Qty"]').nth(1).fill('1')
  check('adding 40HC -> "40 ft" columns appear in all 4 tables', (await page.locator('thead th', { hasText: /^40 ft$/ }).count()) === 4)
  check('QTY auto-detected: 40ft qty placeholder = 1', (await cell(T.bo, 'Ocean Freight', 3).getAttribute('placeholder')) === '1')
  check('origin table has the 6 required lines', (await tbl(T.bo).locator('tbody tr').count()) === 6)
  check('destination table has the 7 required lines', (await tbl(T.bd).locator('tbody tr').count()) === 7)
  for (const l of ['Ocean Freight', 'DG Surcharge', 'THC', 'BL', 'Telex', 'Documentation']) if (!(await row(T.bo, l).count())) check(`origin line ${l}`, false)
  for (const l of ['Admin Fee', 'CIC', 'CMC', 'DTHC', 'LOLO', 'Import Service Fee', 'DO']) if (!(await row(T.bd, l).count())) check(`destination line ${l}`, false)

  // ─── 5. NVOCC pick pre-fills the buying tables from the last quote ──
  await pick(/^Select NVOCC/, nvocc.code)
  await page.getByText(new RegExp(`Prefilled from the last quotation \\(${RUN}-SEED\\)`)).waitFor({ timeout: 15000 }).catch(() => {})
  check('NVOCC suggestion note names the seed quotation', await page.getByText(new RegExp(`Prefilled from the last quotation \\(${RUN}-SEED\\)`)).isVisible())
  check('suggestion pre-filled buying Ocean Freight 111 / 222', (await cell(T.bo, 'Ocean Freight', 0).inputValue()) === '111' && (await cell(T.bo, 'Ocean Freight', 2).inputValue()) === '222')
  check('suggestion pre-filled buying DTHC 7 / 8', (await cell(T.bd, 'DTHC', 0).inputValue()) === '7' && (await cell(T.bd, 'DTHC', 2).inputValue()) === '8')

  // ─── 6. Enter the rates and check every live total ──────────────────
  const put = async (t, l, i, v) => cell(t, l, i).fill(String(v))
  await put(T.bo, 'Ocean Freight', 0, 100); await put(T.bo, 'Ocean Freight', 2, 200)
  await put(T.bo, 'THC', 0, 10); await put(T.bo, 'THC', 2, 20)
  await put(T.bo, 'BL', 0, 50); await put(T.bo, 'BL', 1, 1) // per-B/L: qty override 1
  await tbl(T.bo).getByRole('button', { name: '+ Add charge line' }).click()
  const custom = tbl(T.bo).locator('tbody tr').last().locator('input')
  await custom.nth(0).fill('Seal'); await custom.nth(1).fill('5')
  await put(T.bd, 'DTHC', 0, 30); await put(T.bd, 'DTHC', 2, 60)
  await put(T.so, 'Ocean Freight', 0, 200); await put(T.so, 'Ocean Freight', 2, 400)
  await put(T.so, 'THC', 0, 20); await put(T.so, 'THC', 2, 40)
  await put(T.so, 'BL', 0, 100); await put(T.so, 'BL', 1, 1)
  await put(T.sd, 'DTHC', 0, 50); await put(T.sd, 'DTHC', 2, 100)
  await put(T.sd, 'LOLO', 0, 20)

  check('row total: Ocean Freight 100*2+200*1 = 400.00', (await rowTotal(T.bo, 'Ocean Freight')) === '400.00', await rowTotal(T.bo, 'Ocean Freight'))
  check('per-size totals shown (20ft total 200.00)', (await text(row(T.bo, 'Ocean Freight').locator('td').nth(3))) === '200.00', await text(row(T.bo, 'Ocean Freight').locator('td').nth(3)))
  check('row total: THC = 40.00', (await rowTotal(T.bo, 'THC')) === '40.00')
  check('row total: BL with qty override 1 = 50.00 (not 100)', (await rowTotal(T.bo, 'BL')) === '50.00', await rowTotal(T.bo, 'BL'))
  check('custom line total 5*2 = 10.00', (await text(tbl(T.bo).locator('tbody tr').last().locator('td.font-semibold'))) === '10.00')
  check('buying origin table total = USD 500.00', (await tableTotal(T.bo)) === 'USD 500.00', await tableTotal(T.bo))
  check('buying destination table total = USD 120.00', (await tableTotal(T.bd)) === 'USD 120.00', await tableTotal(T.bd))
  check('selling origin table total = USD 980.00', (await tableTotal(T.so)) === 'USD 980.00', await tableTotal(T.so))
  check('selling destination table total = USD 240.00', (await tableTotal(T.sd)) === 'USD 240.00', await tableTotal(T.sd))
  check('profitability: buying 620.00 / selling 1,220.00 / net 600.00 / 49.18%',
    (await summary('Total Buying')) === 'USD 620.00' && (await summary('Total Selling')) === 'USD 1,220.00' && (await summary('Net Profit')) === 'USD 600.00' && (await summary('Margin %')) === '49.18%',
    `${await summary('Total Buying')} ${await summary('Total Selling')} ${await summary('Net Profit')} ${await summary('Margin %')}`)
  await shot(page, '1-filled-tables')

  // ─── 7. Currency handling ───────────────────────────────────────────
  check('same currency on both tables -> no conversion input', (await tbl(T.bd).locator('input[step="0.0001"]').count()) === 0)
  await pick(/^Currency$/, 'EUR', { nth: 1, search: 'EUR' }) // buying destination
  check('buying destination -> EUR shows the conversion input', (await tbl(T.bd).locator('input[step="0.0001"]').count()) === 1)
  check('conversion label reads "1 EUR = ? USD"', (await text(tbl(T.bd).locator('label', { hasText: '1 EUR' }))).includes('1 EUR = ? USD'))
  await tbl(T.bd).locator('input[step="0.0001"]').fill('')
  await page.getByRole('button', { name: 'Create quotation' }).click()
  check('missing conversion rate blocks submit with a clear error', (await page.getByText('Enter the exchange rate into the origin currency').count()) > 0 && page.url().endsWith('/new'))
  await tbl(T.bd).locator('input[step="0.0001"]').fill('1.1')
  check('EUR 120 x 1.1 -> buying total USD 632.00', (await summary('Total Buying')) === 'USD 632.00', await summary('Total Buying'))
  check('net = 1220 - 632 = 588.00', (await summary('Net Profit')) === 'USD 588.00', await summary('Net Profit'))

  await pick(/^Currency$/, 'EGP', { nth: 2, search: 'EGP' }) // selling origin
  check('changing selling origin currency drags destination currency along', (await selectText(/^Currency$/, 3)).startsWith('EGP'), await selectText(/^Currency$/, 3))
  check('...and does not demand a conversion rate', (await tbl(T.sd).locator('input[step="0.0001"]').count()) === 0)
  await pick(/^Currency$/, 'USD', { nth: 2, search: 'USD' })
  check('switching back restores USD on both selling tables', (await selectText(/^Currency$/, 3)).startsWith('USD'))
  await shot(page, '2-currency')

  // ─── 8. Save ────────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Create quotation' }).click()
  await page.waitForURL(/\/export\/quotations\/[0-9a-f]{24}$/, { timeout: 30000 }).catch(() => {})
  qId = page.url().match(/quotations\/([0-9a-f]{24})/)?.[1] || null
  check('create -> redirected to the quotation detail page', !!qId, page.url())
  const saved = (await api('GET', `/export/quotations/${qId}`)).json?.data
  check('DB: totals computed by the server = 632 / 1220 / 588', near(saved?.totalBuyingCost, 632) && near(saved?.totalSellingPrice, 1220) && near(saved?.netProfit, 588), `${saved?.totalBuyingCost}/${saved?.totalSellingPrice}/${saved?.netProfit}`)
  check('DB: tables stored (BL qty20 override, custom Seal, EUR dest @1.1)',
    saved?.buyingOrigin?.bl?.qty20 === 1 && saved?.buyingOrigin?.custom?.[0]?.label === 'Seal' && saved?.buyingDestinationCurrency === 'EUR' && saved?.buyingDestinationRate === 1.1,
    JSON.stringify([saved?.buyingOrigin?.bl, saved?.buyingDestinationCurrency, saved?.buyingDestinationRate]))

  // ─── 9. Reload -> UI shows the persisted values ─────────────────────
  await page.reload()
  await page.getByText('Created At').waitFor({ timeout: 90000 })
  check('detail: quotation no shown in header', await page.getByText(`${RUN}-A`).first().isVisible())
  check('detail: BL qty override 1 persisted', (await cell(T.bo, 'BL', 1).inputValue()) === '1')
  check('detail: custom "Seal" line persisted', (await tbl(T.bo).locator('tbody tr').last().locator('input').nth(0).inputValue()) === 'Seal')
  check('detail: EUR + 1.1 persisted on buying destination', (await selectText(/^Currency$/, 1)).startsWith('EUR') && (await tbl(T.bd).locator('input[step="0.0001"]').inputValue()) === '1.1')
  check('detail: live totals match the server (USD 632.00 / 1,220.00)', (await summary('Total Buying')) === 'USD 632.00' && (await summary('Total Selling')) === 'USD 1,220.00')
  await shot(page, '3-detail')

  // ─── 10. Edit: change a rate, drop the 40HC container ───────────────
  await put(T.so, 'Ocean Freight', 0, 250)
  check('editing a rate updates totals live (selling OF 250*2+400 = 900.00)', (await rowTotal(T.so, 'Ocean Freight')) === '900.00', await rowTotal(T.so, 'Ocean Freight'))
  await page.locator('label', { hasText: 'Container Type & Quantity' }).locator('xpath=..').locator('button.h-9.w-9').nth(1).click() // remove the 40HC row
  check('removing the 40HC container removes every "40 ft" column', (await page.locator('thead th', { hasText: /^40 ft$/ }).count()) === 0)
  await page.getByRole('button', { name: 'Save changes' }).click()
  check('save shows the success toast', await toastShown(/Quotation updated/))
  const edited = (await api('GET', `/export/quotations/${qId}`)).json?.data
  check('DB after edit: buying 346 (200+20+50+10 + 60x1.1) / selling 780', near(edited?.totalBuyingCost, 346) && near(edited?.totalSellingPrice, 780), `${edited?.totalBuyingCost}/${edited?.totalSellingPrice}`)
  check('DB after edit: no stale 40ft rate/qty stored', edited?.buyingOrigin?.oceanFreight?.rate40 === undefined && edited?.sellingDestination?.dthc?.rate40 === undefined, JSON.stringify(edited?.buyingOrigin?.oceanFreight))

  // ─── 11. Status flow through the UI ─────────────────────────────────
  const click = async (name) => { await page.getByRole('button', { name, exact: true }).click(); await page.waitForTimeout(600) }
  await click('Send to Client')
  check('draft -> sent via UI', (await api('GET', `/export/quotations/${qId}`)).json?.data?.status === 'sent')
  check('sent quotation shows the "Override active" banner to a quotation:approve holder', await vis(page.getByText('Override active'), 8000))
  await click('Move to Negotiation')
  check('sent -> negotiation via UI', (await api('GET', `/export/quotations/${qId}`)).json?.data?.status === 'negotiation')
  await click('Back to Sent')
  await click('Approve')
  check('sent -> approved via UI', (await api('GET', `/export/quotations/${qId}`)).json?.data?.status === 'approved')
  const convertBtn = page.getByRole('button', { name: /Convert to Job/ })
  check('approved quotation offers "Convert to Job & Create Booking"', await vis(convertBtn, 8000))
  await shot(page, '4-approved')

  // ─── 12. Convert to Job -> prefilled booking form (not submitted) ───
  await convertBtn.click()
  await page.waitForURL(new RegExp(`/export/bookings/new\\?fromQuotation=${qId}`), { timeout: 30000 }).catch(() => {})
  check('convert navigates to /export/bookings/new?fromQuotation=<id>', page.url().includes(`fromQuotation=${qId}`), page.url())
  await hasValue('E2E UI Commodity', 90000)
  check('booking form pre-filled: commodity + client name', (await hasValue('E2E UI Commodity', 5000)) && (await hasValue(`E2E UI Client ${RUN}`, 5000)))
  check('booking form pre-filled: price = 780, cost = 346', (await hasValue('780', 5000)) && (await hasValue('346', 5000)))
  await shot(page, '5-booking-prefill')

  // ─── 13. Reject flow through the modal ──────────────────────────────
  const rej = await api('POST', '/export/quotations', {
    quotationNo: `${RUN}-REJ`, customerType: 'new', clientName: 'E2E UI Reject', salesRep: 'E2E', commodity: 'rej', pol: ports[0]._id, pod: ports[1]._id,
    containers: [{ containerType: t20._id, quantity: 1 }], buyingOrigin: { oceanFreight: { rate20: 100 } }, sellingOrigin: { oceanFreight: { rate20: 200 } },
  })
  seedIds.push(rej.json.data._id)
  await api('PUT', `/export/quotations/${rej.json.data._id}/status`, { status: 'sent' })
  await page.goto(`${WEB}/export/quotations/${rej.json.data._id}`)
  await page.getByRole('button', { name: 'Reject', exact: true }).click()
  const confirm = page.getByRole('button', { name: 'Reject Quotation' })
  check('reject modal: confirm disabled until a reason is typed', await confirm.isDisabled())
  await page.getByPlaceholder('Price / transit time / other reason').fill('E2E: client found a cheaper offer')
  await confirm.click()
  check('reject shows the "Rejected:" banner with the reason', await vis(page.locator('strong', { hasText: 'Rejected:' }), 15000))
  const rejDoc = (await api('GET', `/export/quotations/${rej.json.data._id}`)).json?.data
check('DB: status rejected + reason saved', rejDoc?.status === 'rejected' && rejDoc?.rejectionReason === 'E2E: client found a cheaper offer', JSON.stringify([rejDoc?.status, rejDoc?.rejectionReason]))

  // ─── 14. List page ──────────────────────────────────────────────────
  await page.goto(`${WEB}/export/quotations`)
  await page.getByPlaceholder('Search quotation no / client').fill(RUN)
  await page.getByText(`${RUN}-A`).first().waitFor({ timeout: 30000 }).catch(() => {})
  const listed = await page.locator('tbody tr').filter({ hasText: `${RUN}-A` }).first().textContent().catch(() => '')
  check('list: search finds the quotation with NVOCC code + status', !!listed && listed.includes(nvocc.code) && /approved|job/i.test(listed), listed)
  check('list: rejected quotation still listed', (await page.locator('tbody tr').filter({ hasText: `${RUN}-REJ` }).count()) === 1)
  await shot(page, '6-list')

  // ─── 15. Mobile layout ──────────────────────────────────────────────
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${WEB}/export/quotations/${qId}`)
  await page.getByText('Created At').waitFor({ timeout: 60000 })
  await page.waitForTimeout(500)
  // The dashboard scrolls inside <main>, not the document — measure both, plus the table wrapper itself.
  const m = await page.evaluate(() => {
    const main = document.querySelector('main')
    const wrap = document.querySelector('div.overflow-x-auto')
    return { doc: document.documentElement.scrollWidth - window.innerWidth, main: main.scrollWidth - main.clientWidth, wrapScrolls: wrap.scrollWidth > wrap.clientWidth, wrapFits: wrap.getBoundingClientRect().right <= window.innerWidth + 1 }
  })
  check('mobile 390px: neither the document nor <main> scrolls horizontally', m.doc <= 1 && m.main <= 1, JSON.stringify(m))
  check('mobile 390px: the rate table scrolls inside its own wrapper and stays on-screen', m.wrapScrolls && m.wrapFits, JSON.stringify(m))
  await tbl(T.bo).scrollIntoViewIfNeeded()
  await shot(page, '7-mobile')
} catch (err) {
  check('UI run completed without an unexpected error', false, err.stack || err.message)
  await shot(page, 'FAILURE').catch(() => {})
} finally {
  const noise = /favicon|Failed to load resource: the server responded with a status of 401/
  const real = consoleErrors.filter((e) => !noise.test(e))
  check('no browser console errors / page errors during the run', real.length === 0, '\n    ' + real.slice(0, 6).join('\n    '))
  await browser.close()
  try {
    await mongoose.connect(process.env.MONGO_URI)
    const db = mongoose.connection.db
    const dq = await db.collection('quotations').deleteMany({ quotationNo: { $regex: `^${RUN}` } })
    const dc = await db.collection('customers').deleteMany({ name: { $regex: `^E2E UI Client ${RUN}` } })
    console.log(`cleanup: removed ${dq.deletedCount} quotation(s), ${dc.deletedCount} customer(s)`)
    await mongoose.disconnect()
  } catch (e) { console.log('CLEANUP FAILED — remove E2E-UI data by hand:', e.message) }
  const failed = results.filter((x) => !x.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed, run=${RUN}`)
  process.exitCode = failed.length ? 1 : 0
}
