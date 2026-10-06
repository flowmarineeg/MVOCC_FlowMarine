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
// row total cell reads e.g. "USD400.00" (currency chip + amount) — keep just the amount
const rowTotal = async (title, label) => (await text(row(title, label).locator('td.font-semibold'))).replace(/^[A-Z]{3}/, '')
const tableTotals = async (title) => (await tbl(title).locator('tfoot td.font-bold div').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim())
const tableTotal = async (title) => (await tableTotals(title)).join(' + ')
const currencyOf = (title, label) => tbl(title).getByLabel(`Currency for ${label}`)
const rowCount = (title) => tbl(title).locator('tbody tr').count()
const profitRow = async (cur) => (await page.locator('[data-testid="profit-table"] tbody tr').filter({ has: page.locator('td', { hasText: new RegExp(`^${cur}$`) }) }).first().locator('td').allTextContents()).map((t) => t.trim())
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
    customerType: 'new', clientName: `E2E UI Seed ${RUN}`, salesRep: 'E2E', commodity: 'seed', pol: ports[0]._id, pod: ports[1]._id, nvocc: nvocc._id,
    containers: [{ containerType: t20._id, quantity: 1 }, { containerType: t40._id, quantity: 1 }],
    buyingOrigin: { oceanFreight: { rate20: 111, rate40: 222 } }, buyingDestination: { dthc: { rate20: 7, rate40: 8 } },
  })
  const seedNo = seed.json?.data?.quotationNo
  if (seed.status === 201) seedIds.push(seed.json.data._id)
  check('seed quotation for NVOCC suggestion created', seed.status === 201, JSON.stringify(seed.json))

  // ─── 2. New quotation form: empty state + client-side validation ────
  await page.goto(`${WEB}/export/quotations/new`)
  await page.getByText('1. Client Request Data').waitFor({ timeout: 90000 })
  check('form renders all 8 sections, in order: Client, Ports, Containers & Cargo, Rate Request, NVOCC, Buying, Selling, Profitability',
    (await page.locator('h2').allTextContents()).join('|') === '1. Client Request Data|2. Ports|3. Containers & Cargo|4. Rate Request|5. NVOCC (Master Data)|6. Buying Rate|7. Selling Price to Client|8. Profitability', (await page.locator('h2').allTextContents()).join('|'))
  const labelOrder = (await page.locator('label').allTextContents()).map((t) => t.trim())
  const labelTexts = labelOrder.join('|')
  check('UN Class / POR / FPD inputs are gone; Target Rate + Cargo Readiness Date are present',
    !/UN Class|(^|\|)POR|FPD/.test(labelTexts) && /Target Rate/.test(labelTexts) && /Cargo Readiness Date/.test(labelTexts), labelTexts)
  check('Quotation No is read-only / auto-generated', await fieldInput(/Quotation No/).isDisabled())
  const iRep = labelOrder.findIndex((t) => /^Sales Representative/.test(t))
  check('Sales Representative sits above Client Type', iRep > -1 && iRep < labelOrder.findIndex((t) => /^Client Type/.test(t)))
  check('Sales Representative auto-detects the logged-in user', (await selectText(/^Sales Representative/)).length > 3 && !/^Select/.test(await selectText(/^Sales Representative/)), await selectText(/^Sales Representative/))
  check('empty state: each rate table explains the 20/40ft detection', (await page.getByText(/20ft \/ 40ft columns are detected automatically/).count()) === 4)
  await page.getByRole('button', { name: 'Create quotation' }).click()
  check('submitting empty form shows required-field errors, no navigation',
    (await page.getByText('Commodity is required').count()) > 0 &&
    (await page.getByText('Port of loading is required').count()) > 0 && page.url().endsWith('/new'), page.url())

  // ─── 3. Fill Section 1 (incl. the inline "New Client" modal) ────────
  // Sales rep dropdown can switch to another team member (admin holds team:read)
  const currentRep = await selectText(/^Sales Representative/)
  const members = (await api('GET', '/team/members?status=active&limit=100')).json?.members || []
  const other = members.find((m) => m.email && !currentRep.includes(m.email))
  if (other) {
    await pick(/^Sales Representative/, other.email)
    check('Sales Representative can be switched to another team member', (await selectText(/^Sales Representative/)).includes(other.email), await selectText(/^Sales Representative/))
  } else check('Sales Representative can be switched to another team member (only one active member, skipped)', true)

  // Contact Person is a dropdown of the selected client's contact rows (name + phone)
  const withContacts = await api('POST', '/master/customers', {
    name: `E2E UI Client ${RUN} Contacts`, phone: '+2000', email: 'co@example.com',
    contacts: [{ name: 'Alice Contact', phone: '+20111', email: 'alice@example.com' }, { name: 'Bob Contact', phone: '+20222' }],
  })
  const contactsCustomerName = withContacts.json?.data?.name
  const cpRoot = page.locator('label').filter({ hasText: /^Contact Person/ }).locator('xpath=..')
  check('contact person is disabled until a client is chosen', await cpRoot.locator('button').first().isDisabled())
  await page.reload()
  await page.getByText('1. Client Request Data').waitFor({ timeout: 90000 })
  await pick(/^Client Name/, contactsCustomerName, { search: 'Contacts' })
  await cpRoot.locator('button').first().click()
  const cpOptions = await cpRoot.locator('div.absolute button').allTextContents()
  check('contact person lists the client contacts as "name - phone"', cpOptions.some((t) => t.includes('Alice Contact') && t.includes('+20111')) && cpOptions.some((t) => t.includes('Bob Contact') && t.includes('+20222')), cpOptions.join(' | '))
  await cpRoot.locator('div.absolute button').filter({ hasText: 'Alice Contact' }).click()
  check('picking a contact fills Contact Phone + Email', (await fieldInput(/^Contact Phone/).inputValue()) === '+20111' && (await fieldInput(/^Contact Email/).inputValue()) === 'alice@example.com')
  // back to the new-client flow used by the rest of this run
  await page.getByRole('button', { name: 'New Client', exact: true }).click()
  check('switching client type clears the contact person', (await selectText(/^Contact Person/)).includes('Select a client first'), await selectText(/^Contact Person/))
  await page.getByRole('button', { name: 'New Client', exact: true }).click()
  await page.getByRole('button', { name: '+ Create new client' }).click()
  await page.locator('label').filter({ hasText: /^Name/ }).locator('xpath=..').locator('input').fill(`E2E UI Client ${RUN}`)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  check('inline New Client modal creates a client (nested-form regression)', await vis(page.getByText('(new client)')))
  await fieldInput(/^Commodity/).fill('E2E UI Commodity')
  await pick(/^POL/, ports[0].code)
  await pick(/^POD/, ports[1].code)
  // every dropdown can be set back to "unselected" with its ✕
  const podRoot = page.locator('label').filter({ hasText: /^POD/ }).locator('xpath=..')
  await podRoot.getByRole('button', { name: 'Clear selection' }).click()
  check('POD dropdown: ✕ clears the selected value back to the placeholder', (await selectText(/^POD/)) === 'Port of Discharge', await selectText(/^POD/))
  check('...and the ✕ is gone once nothing is selected', (await podRoot.getByRole('button', { name: 'Clear selection' }).count()) === 0)
  await pick(/^POD/, ports[1].code)
  check('other dropdowns are clearable too (Sales Representative has its ✕)', (await page.locator('label').filter({ hasText: /^Sales Representative/ }).locator('xpath=..').getByRole('button', { name: 'Clear selection' }).count()) === 1)

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
  check('destination table has the 5 required lines (CIC and CMC are gone)', (await tbl(T.bd).locator('tbody tr').count()) === 5)
  check('every row has its own currency column, defaulting to USD', (await page.locator('thead th', { hasText: /^Currency$/ }).count()) === 4 && (await currencyOf(T.bo, 'Ocean Freight').inputValue()) === 'USD')
  for (const l of ['Ocean Freight', 'DG Surcharge', 'THC', 'BL', 'Telex', 'Documentation']) if (!(await row(T.bo, l).count())) check(`origin line ${l}`, false)
  for (const l of ['Admin Fee', 'DTHC', 'LOLO', 'Import Service Fee', 'DO']) if (!(await row(T.bd, l).count())) check(`destination line ${l}`, false)

  // ─── 5. NVOCC pick pre-fills the buying tables from the last quote ──
  await pick(/^Select NVOCC/, nvocc.code)
  await page.getByText(new RegExp(`Prefilled from the last quotation \\(${seedNo}\\)`)).waitFor({ timeout: 15000 }).catch(() => {})
  check('NVOCC suggestion note names the seed quotation', await page.getByText(new RegExp(`Prefilled from the last quotation \\(${seedNo}\\)`)).isVisible())
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

  // Buying -> Selling mirroring: the new Seal row (and every value typed above) appears on Selling too
  check('a new Buying row is mirrored into the Selling origin table with the same label + rate',
    (await rowCount(T.so)) === 7 && (await tbl(T.so).locator('tbody tr').last().locator('input').nth(0).inputValue()) === 'Seal' && (await tbl(T.so).locator('tbody tr').last().locator('input').nth(1).inputValue()) === '5')
  check('a Buying value is mirrored into the Selling table (OF rate 100 / 200)', (await cell(T.so, 'Ocean Freight', 0).inputValue()) === '100' && (await cell(T.so, 'Ocean Freight', 2).inputValue()) === '200')
  // the mirrored Seal row isn't wanted on Selling for this scenario -> removing it must not touch Buying
  await tbl(T.so).locator('tbody tr').last().getByRole('button', { name: 'Remove charge line' }).click()
  check('removing the mirrored row from Selling works and leaves Buying untouched', (await rowCount(T.so)) === 6 && (await rowCount(T.bo)) === 7)

  await put(T.so, 'Ocean Freight', 0, 200); await put(T.so, 'Ocean Freight', 2, 400)
  await put(T.so, 'THC', 0, 20); await put(T.so, 'THC', 2, 40)
  await put(T.so, 'BL', 0, 100); await put(T.so, 'BL', 1, 1)
  await put(T.sd, 'DTHC', 0, 50); await put(T.sd, 'DTHC', 2, 100)
  await put(T.sd, 'LOLO', 0, 20)
  check('Selling edits do NOT flow back to Buying (buying OF still 100 / 200, THC 10 / 20)',
    (await cell(T.bo, 'Ocean Freight', 0).inputValue()) === '100' && (await cell(T.bo, 'Ocean Freight', 2).inputValue()) === '200' && (await cell(T.bo, 'THC', 0).inputValue()) === '10' && (await cell(T.bo, 'THC', 2).inputValue()) === '20')

  check('row total: Ocean Freight 100*2+200*1 = 400.00', (await rowTotal(T.bo, 'Ocean Freight')) === '400.00', await rowTotal(T.bo, 'Ocean Freight'))
  check('per-size totals shown (20ft total 200.00)', (await text(row(T.bo, 'Ocean Freight').locator('td').nth(4))) === '200.00', await text(row(T.bo, 'Ocean Freight').locator('td').nth(4)))
  check('row total: THC = 40.00', (await rowTotal(T.bo, 'THC')) === '40.00')
  check('row total: BL with qty override 1 = 50.00 (not 100)', (await rowTotal(T.bo, 'BL')) === '50.00', await rowTotal(T.bo, 'BL'))
  check('custom line total 5*2 = 10.00', (await text(tbl(T.bo).locator('tbody tr').last().locator('td.font-semibold'))).replace(/^[A-Z]{3}/, '') === '10.00')
  check('buying origin table total = USD 500.00', (await tableTotal(T.bo)) === 'USD 500.00', await tableTotal(T.bo))
  check('buying destination table total = USD 120.00', (await tableTotal(T.bd)) === 'USD 120.00', await tableTotal(T.bd))
  check('selling origin table total = USD 980.00', (await tableTotal(T.so)) === 'USD 980.00', await tableTotal(T.so))
  check('selling destination table total = USD 240.00', (await tableTotal(T.sd)) === 'USD 240.00', await tableTotal(T.sd))
  const usd1 = await profitRow('USD')
  check('profitability (USD): buying 620.00 / selling 1,220.00 / net 600.00 / 49.18%', usd1[1] === '620.00' && usd1[2] === '1,220.00' && usd1[3] === '600.00' && usd1[4] === '49.18%', usd1.join(' | '))
  await shot(page, '1-filled-tables')

  // ─── 7. Per-row currency: totals grouped per currency, no conversion ─
  await currencyOf(T.bo, 'BL').selectOption('EGP')
  check('changing a Buying row currency is mirrored onto the Selling row', (await currencyOf(T.so, 'BL').inputValue()) === 'EGP')
  check('buying origin total groups each currency together: USD 450.00 + EGP 50.00', (await tableTotal(T.bo)) === 'USD 450.00 + EGP 50.00', await tableTotal(T.bo))
  check('selling origin total groups each currency together: USD 880.00 + EGP 100.00', (await tableTotal(T.so)) === 'USD 880.00 + EGP 100.00', await tableTotal(T.so))
  const usd2 = await profitRow('USD'), egp2 = await profitRow('EGP')
  check('profit per currency — USD: 570.00 / 1,120.00 / 550.00 / 49.11%', usd2[1] === '570.00' && usd2[2] === '1,120.00' && usd2[3] === '550.00' && usd2[4] === '49.11%', usd2.join(' | '))
  check('profit per currency — EGP: 50.00 / 100.00 / 50.00 / 50.00% (never converted into USD)', egp2[1] === '50.00' && egp2[2] === '100.00' && egp2[3] === '50.00' && egp2[4] === '50.00%', egp2.join(' | '))
  check('no exchange-rate / conversion inputs remain, and no Valid Until', (await page.locator('input[step="0.0001"]').count()) === 0 && (await page.locator('label', { hasText: /Exchange Rate|Valid Until/ }).count()) === 0)
  await currencyOf(T.so, 'BL').selectOption('USD')
  check('changing a Selling row currency does NOT change Buying', (await currencyOf(T.bo, 'BL').inputValue()) === 'EGP')
  await currencyOf(T.so, 'BL').selectOption('EGP')

  // value sync one-way, then removing rows (data row asks for confirmation)
  await put(T.bo, 'DG Surcharge', 0, 3)
  check('Buying DG Surcharge 3 is mirrored to Selling', (await cell(T.so, 'DG Surcharge', 0).inputValue()) === '3')
  await put(T.so, 'DG Surcharge', 0, 9)
  check('...and editing it on Selling leaves Buying at 3', (await cell(T.bo, 'DG Surcharge', 0).inputValue()) === '3')
  page.once('dialog', (d) => d.accept())
  await row(T.bo, 'DG Surcharge').getByRole('button', { name: 'Remove DG Surcharge row' }).click()
  page.once('dialog', (d) => d.accept())
  await row(T.so, 'DG Surcharge').getByRole('button', { name: 'Remove DG Surcharge row' }).click()
  check('a standard row (even with data) can be removed from each table independently', (await row(T.bo, 'DG Surcharge').count()) === 0 && (await row(T.so, 'DG Surcharge').count()) === 0 && (await rowCount(T.bo)) === 6 && (await rowCount(T.so)) === 5)
  check('removed rows no longer count (profit unchanged: USD 570.00 / 1,120.00)', (await profitRow('USD'))[1] === '570.00' && (await profitRow('USD'))[2] === '1,120.00')
  await tbl(T.bo).getByLabel('Restore a removed row').selectOption({ label: 'DG Surcharge' })
  check('a removed standard row can be restored (empty), and comes back on Selling too', (await row(T.bo, 'DG Surcharge').count()) === 1 && (await cell(T.bo, 'DG Surcharge', 0).inputValue()) === '' && (await row(T.so, 'DG Surcharge').count()) === 1)
  await row(T.bo, 'Documentation').getByRole('button', { name: 'Remove Documentation row' }).click() // empty row -> no confirm; stays removed through save
  check('removing an unused standard row needs no confirmation', (await row(T.bo, 'Documentation').count()) === 0 && (await rowCount(T.bo)) === 6)
  await shot(page, '2-currency')

  // ─── 8. Save ────────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Create quotation' }).click()
  await page.waitForURL(/\/export\/quotations\/[0-9a-f]{24}$/, { timeout: 30000 }).catch(() => {})
  qId = page.url().match(/quotations\/([0-9a-f]{24})/)?.[1] || null
  check('create -> redirected to the quotation detail page', !!qId, page.url())
  const saved = (await api('GET', `/export/quotations/${qId}`)).json?.data
  const qNo = saved?.quotationNo
  check('DB: per-currency totals computed by the server (primary USD 570 / 1120 / 550)', saved?.totalsCurrency === 'USD' && near(saved?.totalBuyingCost, 570) && near(saved?.totalSellingPrice, 1120) && near(saved?.netProfit, 550), `${saved?.totalsCurrency} ${saved?.totalBuyingCost}/${saved?.totalSellingPrice}/${saved?.netProfit}`)
  check('DB: EGP kept as its own row (50 / 100), not converted', near(saved?.totalsByCurrency?.find((x) => x.currency === 'EGP')?.buying, 50) && near(saved?.totalsByCurrency?.find((x) => x.currency === 'EGP')?.selling, 100), JSON.stringify(saved?.totalsByCurrency))
  check('DB: tables stored (BL qty20 override + EGP on both sides, custom Seal with uid + currency, removed Documentation row)',
    saved?.buyingOrigin?.bl?.qty20 === 1 && saved?.buyingOrigin?.bl?.currency === 'EGP' && saved?.sellingOrigin?.bl?.currency === 'EGP' && saved?.buyingOrigin?.custom?.[0]?.label === 'Seal' && !!saved?.buyingOrigin?.custom?.[0]?.uid && saved?.buyingOrigin?.custom?.[0]?.currency === 'USD' && saved?.buyingOrigin?.hidden?.includes('documentation'),
    JSON.stringify([saved?.buyingOrigin?.bl, saved?.buyingOrigin?.custom, saved?.buyingOrigin?.hidden]))

  // ─── 9. Reload -> UI shows the persisted values ─────────────────────
  await page.reload()
  await page.getByText('Created At').waitFor({ timeout: 90000 })
  check('detail: quotation no shown in header', await page.getByText(qNo).first().isVisible())
  check('detail: BL qty override 1 persisted', (await cell(T.bo, 'BL', 1).inputValue()) === '1')
  check('detail: custom "Seal" line persisted', (await tbl(T.bo).locator('tbody tr').last().locator('input').nth(0).inputValue()) === 'Seal')
  check('detail: per-row EGP currency persisted on BL (buying + selling)', (await currencyOf(T.bo, 'BL').inputValue()) === 'EGP' && (await currencyOf(T.so, 'BL').inputValue()) === 'EGP')
  check('detail: the removed Documentation row stays removed, and can be restored', (await row(T.bo, 'Documentation').count()) === 0 && (await tbl(T.bo).getByLabel('Restore a removed row').count()) === 1)
  const usd3 = await profitRow('USD')
  check('detail: live profit table matches the server (USD 570.00 / 1,120.00)', usd3[1] === '570.00' && usd3[2] === '1,120.00', usd3.join(' | '))
  await shot(page, '3-detail')

  // ─── 10. Edit: change a rate, drop the 40HC container ───────────────
  await put(T.so, 'Ocean Freight', 0, 250)
  check('editing a rate updates totals live (selling OF 250*2+400 = 900.00)', (await rowTotal(T.so, 'Ocean Freight')) === '900.00', await rowTotal(T.so, 'Ocean Freight'))
  await page.locator('label', { hasText: 'Container Type & Quantity' }).locator('xpath=..').locator('button.h-9.w-9').nth(1).click() // remove the 40HC row
  check('removing the 40HC container removes every "40 ft" column', (await page.locator('thead th', { hasText: /^40 ft$/ }).count()) === 0)
  await page.getByRole('button', { name: 'Save changes' }).click()
  check('save shows the success toast', await toastShown(/Quotation updated/))
  const edited = (await api('GET', `/export/quotations/${qId}`)).json?.data
  check('DB after edit: USD buying 290 (200+20+10+60) / selling 680 (500+40+100+40); EGP BL unchanged', near(edited?.totalBuyingCost, 290) && near(edited?.totalSellingPrice, 680) && near(edited?.totalsByCurrency?.find((x) => x.currency === 'EGP')?.selling, 100), `${edited?.totalBuyingCost}/${edited?.totalSellingPrice} ${JSON.stringify(edited?.totalsByCurrency)}`)
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
  check('booking form pre-filled: price = 680, cost = 290 (primary currency USD)', (await hasValue('680', 5000)) && (await hasValue('290', 5000)))
  await shot(page, '5-booking-prefill')

  // ─── 13. Reject flow through the modal ──────────────────────────────
  const rej = await api('POST', '/export/quotations', {
    customerType: 'new', clientName: `E2E UI Reject ${RUN}`, salesRep: 'E2E', commodity: 'rej', pol: ports[0]._id, pod: ports[1]._id,
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
  await page.getByText(qNo).first().waitFor({ timeout: 30000 }).catch(() => {})
  const listed = await page.locator('tbody tr').filter({ hasText: qNo }).first().textContent().catch(() => '')
  check('list: search finds the quotation with NVOCC code + status', !!listed && listed.includes(nvocc.code) && /approved|job/i.test(listed), listed)
  check('list: rejected quotation still listed', (await page.locator('tbody tr').filter({ hasText: rej.json.data.quotationNo }).count()) === 1)
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
    const mine = (await db.collection('quotations').find({ clientName: { $regex: RUN } }).project({ quotationNo: 1 }).toArray()).map((q) => q.quotationNo).sort()
    const dq = await db.collection('quotations').deleteMany({ clientName: { $regex: RUN } })
    // Give the consumed quotation numbers back ONLY while ours are still the tail.
    const qYear = new Date().getFullYear()
    for (const no of [...mine].reverse()) {
      const res = await db.collection('jobcounters').updateOne({ _id: `quotation-${qYear}`, seq: Number(/(\d{4})$/.exec(no)?.[1]) }, { $inc: { seq: -1 } })
      if (!res.modifiedCount) break
    }
    const dc = await db.collection('customers').deleteMany({ name: { $regex: `^E2E UI Client ${RUN}` } })
    console.log(`cleanup: removed ${dq.deletedCount} quotation(s), ${dc.deletedCount} customer(s)`)
    await mongoose.disconnect()
  } catch (e) { console.log('CLEANUP FAILED — remove E2E-UI data by hand:', e.message) }
  const failed = results.filter((x) => !x.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed, run=${RUN}`)
  process.exitCode = failed.length ? 1 : 0
}
