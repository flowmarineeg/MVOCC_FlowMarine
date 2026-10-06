// Browser E2E for the Master Data update — real Edge (playwright-core), real UI on :3000,
// real API on :5000. Run: cd e2e && npm install && npm run masterdata:ui
// (backend + frontend must be running). Creates E2E-MD-UI-* records through the UI and
// deletes them through the API when done.
import { pathToFileURL, fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const BACKEND = fileURLToPath(new URL('../../backend/', import.meta.url))
const { default: dotenv } = await import(pathToFileURL(BACKEND + 'node_modules/dotenv/lib/main.js').href)
dotenv.config({ path: BACKEND + '.env' })

const WEB = process.env.WEB || 'http://localhost:3000'
const API = process.env.API || 'http://localhost:5000/api'
const RUN = `E2E-MD-UI-${Date.now().toString(36).toUpperCase()}`
const results = []
const consoleErrors = []
const check = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + detail}`)
  return !!cond
}

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
context.setDefaultTimeout(30000)
const page = await context.newPage()
// 401 = the pre-login /auth/me probe, 409 = the VO delete guard this test triggers on purpose.
page.on('console', (m) => { if (m.type() === 'error' && !/status of (401|409)/.test(m.text())) consoleErrors.push(`${m.text()} @ ${page.url()}`) })
page.on('pageerror', (e) => consoleErrors.push(`PAGEERROR ${e.message} @ ${page.url()}`))

const api = async (method, path, data) => {
  const res = await context.request.fetch(API + path, { method, data, headers: { 'content-type': 'application/json' } })
  return { status: res.status(), json: await res.json().catch(() => null) }
}
const modal = () => page.locator('div.fixed.inset-0').last()
const field = (labelRe) => modal().locator('label').filter({ hasText: labelRe }).first().locator('xpath=..').locator('input, select').first()
const tab = (name) => page.getByRole('button', { name, exact: true })
const vis = (loc, t = 10000) => loc.first().waitFor({ state: 'visible', timeout: t }).then(() => true).catch(() => false)
const gone = (loc, t = 10000) => loc.first().waitFor({ state: 'hidden', timeout: t }).then(() => true).catch(() => false)
const openNew = async (singular) => { await page.getByRole('button', { name: `New ${singular}` }).click(); await vis(modal().locator('form')) }
const save = async () => { await modal().getByRole('button', { name: 'Save', exact: true }).click() }
const rowOf = (text) => page.locator('tbody tr').filter({ hasText: text })

const TABS = ['Container Types', 'Carriers', 'Ports (POL / POD)', 'NVOCC', 'VO (Vessel Operators)', 'Vessels', 'Depots', 'Customers', 'Agents', 'Parties', 'Packages', 'Units']
const cleanup = [] // [apiPath, name-prefix lookup]

try {
  // ─── login ──────────────────────────────────────────────────────────
  await page.goto(`${WEB}/login`)
  await page.locator('input[type="email"]').fill(process.env.ADMIN_EMAIL)
  await page.locator('input[type="password"], input[type="text"]').last().fill(process.env.ADMIN_DEFAULT_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 })
  check('login through the real UI', true)

  await page.goto(`${WEB}/master-data`)
  await vis(page.getByRole('heading', { name: 'Master Data' }))
  const tabResults = await Promise.all(TABS.map((t) => vis(tab(t), 3000)))
  check('every expected tab is present (incl. Carriers, new VO/Vessels/Agents/Parties/Packages/Units)', tabResults.every(Boolean), TABS.filter((_, i) => !tabResults[i]).join(', '))

  // ─── NVOCC: new inputs + contact rows add/delete ─────────────────────
  await tab('NVOCC').click()
  await openNew('NVOCC')
  const labels = (await modal().locator('label').allTextContents()).join('|')
  check('NVOCC form has Address / Tax Number / Registration Number / Contract Type / Valid From / Valid To / Contacts',
    ['Address', 'Tax Number', 'Registration Number', 'Contract Type', 'Valid From', 'Valid To', 'Contacts'].every((l) => labels.includes(l)), labels)
  check('NVOCC form no longer has Local Agent inputs', !/Local Agent/.test(labels), labels)
  await field(/^Name/).fill(`${RUN} NVOCC`)
  await field(/^Code/).fill(`${RUN}-NV`)
  await field(/Registration Number/).fill('REG-77')
  await field(/Contract Type/).selectOption('Contract')
  await field(/Valid From/).fill('2026-01-01')
  await field(/Valid To/).fill('2026-12-31')
  await modal().getByRole('button', { name: 'Add contact' }).click()
  await modal().getByRole('button', { name: 'Add contact' }).click()
  const nameInputs = modal().locator('input[placeholder="Name *"]')
  check('Add contact adds rows', (await nameInputs.count()) === 2)
  await nameInputs.nth(0).fill('Alice Ops')
  await modal().locator('input[placeholder="Title"]').nth(0).fill('Manager')
  await modal().locator('input[placeholder="Email"]').nth(0).fill('alice@example.com')
  await modal().locator('input[placeholder="Phone"]').nth(0).fill('+20100000001')
  await nameInputs.nth(1).fill('Bob Delete Me')
  await modal().locator('button[title="Remove contact"]').nth(1).click()
  check('Remove contact deletes the row', (await nameInputs.count()) === 1)
  await save()
  check('NVOCC saves; table shows it with "1 contact"', await vis(rowOf(`${RUN}-NV`).filter({ hasText: '1 contact' })))
  cleanup.push('/master/nvoccs')

  // edit round-trip keeps the contact
  await rowOf(`${RUN}-NV`).locator('button[title="Edit"]').click()
  await vis(modal().locator('form'))
  check('editing an NVOCC reloads its contact row values', (await modal().locator('input[placeholder="Name *"]').first().inputValue()) === 'Alice Ops'
    && (await modal().locator('input[placeholder="Phone"]').first().inputValue()) === '+20100000001')
  await modal().getByRole('button', { name: 'Add contact' }).click() // blank row left unfilled — must not be saved
  await save()
  await gone(modal().locator('form'))
  await page.waitForTimeout(500)
  const nv = (await api('GET', '/master/nvoccs')).json.data.find((n) => n.code === `${RUN}-NV`)
  check('an empty added contact row is discarded on save', nv?.contacts?.length === 1 && nv.registrationNumber === 'REG-77', JSON.stringify(nv?.contacts))

  // ─── VO then Vessel (select VO + name) ───────────────────────────────
  await tab('VO (Vessel Operators)').click()
  await openNew('Vessel Operator')
  await field(/^Name/).fill(`${RUN} VO`)
  await field(/VO Code/).fill(`${RUN}-VO`)
  await save()
  check('VO saves', await vis(rowOf(`${RUN}-VO`)))
  cleanup.push('/master/vessel-operators')

  await tab('Vessels').click()
  await openNew('Vessel')
  await field(/Vessel Operator/).selectOption({ label: `${RUN}-VO — ${RUN} VO` })
  await field(/Vessel Name/).fill(`${RUN} MV Test`)
  await save()
  check('Vessel saves; table shows the VO name', await vis(rowOf(`${RUN} MV Test`).filter({ hasText: `${RUN} VO` })))
  cleanup.unshift('/master/vessels') // vessels must go before their VO

  // ─── Customer: country + governorate (free library) ──────────────────
  await tab('Customers').click()
  await openNew('Customer')
  await field(/^Name/).fill(`${RUN} Customer`)
  check('Governorate is disabled until a country is picked', await field(/Governorate/).isDisabled())
  await page.waitForFunction(() => [...document.querySelectorAll('div.fixed select')].some((s) => s.options.length > 100), null, { timeout: 15000 })
  await field(/^Country/).selectOption('Egypt')
  const govs = await field(/Governorate/).locator('option').allTextContents()
  check('Egypt exposes its governorates (library-backed)', govs.includes('Cairo') && govs.includes('Alexandria') && govs.length > 20, govs.slice(0, 5).join(','))
  await field(/Governorate/).selectOption('Cairo')
  await field(/^Country/).selectOption('Germany')
  check('changing country clears the governorate', (await field(/Governorate/).inputValue().catch(() => '')) === '')
  await field(/^Country/).selectOption('Egypt')
  await field(/Governorate/).selectOption('Alexandria')
  await save()
  check('Customer saves with country + governorate', await vis(rowOf(`${RUN} Customer`).filter({ hasText: 'Egypt' }).filter({ hasText: 'Alexandria' })))
  cleanup.push('/master/customers')

  // ─── Agent (country selector), Parties (type), Packages, Units ───────
  await tab('Agents').click()
  await openNew('Agent')
  await field(/^Name/).fill(`${RUN} Agent`)
  await field(/Agent Code/).fill(`${RUN}-AG`)
  await page.waitForFunction(() => [...document.querySelectorAll('div.fixed select')].some((s) => s.options.length > 100), null, { timeout: 15000 })
  await field(/^Country/).selectOption('China')
  await save()
  check('Agent saves with a country', await vis(rowOf(`${RUN}-AG`).filter({ hasText: 'China' })))
  cleanup.push('/master/agents')

  await tab('Parties').click()
  await openNew('Party')
  await field(/Party Type/).selectOption('notify')
  await field(/^Name/).fill(`${RUN} Notify Co`)
  await field(/Party Code/).fill(`${RUN}-PT`)
  await save()
  check('Party saves; table shows its type', await vis(rowOf(`${RUN}-PT`).filter({ hasText: 'Notify' })))
  cleanup.push('/master/parties')

  await tab('Packages').click()
  await openNew('Package')
  await field(/Package Name/).fill(`${RUN} Carton`)
  await save()
  check('Package saves (name only)', await vis(rowOf(`${RUN} Carton`)))
  cleanup.push('/master/packages')

  await tab('Units').click()
  await openNew('Unit')
  await field(/Unit Type/).selectOption('weight')
  await field(/Unit Name/).fill(`${RUN} Tonne`)
  await field(/Symbol/).fill(`${RUN}t`)
  await save()
  check('Unit saves with type/name/symbol', await vis(rowOf(`${RUN} Tonne`).filter({ hasText: 'Weight' }).filter({ hasText: `${RUN}t` })))
  cleanup.push('/master/units')

  // ─── Depot, plus delete flow + guard ─────────────────────────────────
  await tab('Depots').click()
  await openNew('Depot')
  await field(/^Name/).fill(`${RUN} Depot`)
  await field(/Depot Code/).fill(`${RUN}-DP`)
  await modal().getByRole('button', { name: 'Add contact' }).click()
  await modal().locator('input[placeholder="Name *"]').first().fill('Dana')
  await save()
  check('Depot saves with a contact row', await vis(rowOf(`${RUN}-DP`).filter({ hasText: '1 contact' })))
  cleanup.push('/master/depots')

  await tab('VO (Vessel Operators)').click()
  await rowOf(`${RUN}-VO`).locator('button[title="Delete"]').click()
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click()
  check('deleting a VO that still has a vessel is refused (409 toast), row stays', await vis(page.getByText(/has 1 vessel/)) && (await rowOf(`${RUN}-VO`).count()) === 1)

  check('no console / page errors during the whole run', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
} catch (err) {
  check('test run completed without an unexpected error', false, err.stack || err.message)
  await page.screenshot({ path: new URL(`./fail-${RUN}.png`, import.meta.url).pathname.replace(/^\//, ''), fullPage: true }).catch(() => {})
} finally {
  // delete everything E2E-MD-UI-* through the API (vessels first, then VOs, etc.)
  let removed = 0
  for (const path of [...new Set(cleanup)]) {
    const list = (await api('GET', path)).json?.data || []
    for (const rec of list.filter((x) => JSON.stringify(x).includes(RUN))) {
      const r = await api('DELETE', `${path}/${rec._id}`)
      if (r.status === 200) removed++
      else console.log(`CLEANUP: DELETE ${path}/${rec._id} -> ${r.status} — remove by hand`)
    }
  }
  console.log(`cleanup: removed ${removed} record(s)`)
  await browser.close()
  const failed = results.filter((x) => !x.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed, run=${RUN}`)
  process.exitCode = failed.length ? 1 : 0
}
