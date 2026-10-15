// Sprint 007 — Booking & Job vs the Export PRD, in the browser: the step panels (what is missing,
// Complete step, lock, Amend), the new Step 1-5 fields, the container grid with VGM + reconciliation,
// Final S/D with draft + approval, HBL issuance / lock / re-issue, roll-over. Real Edge via
// playwright-core against :3000 / :5000. Run: cd e2e && npm run booking:prd-ui
// Creates E2E-BOOKING-PRDUI-* data (temp Egypt port, container type, VO, stock, one job) and removes it.
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BACKEND = fileURLToPath(new URL('../../backend/', import.meta.url))
const imp = (p) => import(pathToFileURL(BACKEND + p).href)
const { default: dotenv } = await imp('node_modules/dotenv/lib/main.js')
dotenv.config({ path: BACKEND + '.env' })
const { default: mongoose } = await imp('node_modules/mongoose/index.js')

const WEB = process.env.WEB || 'http://localhost:3000'
const API = process.env.API || 'http://localhost:5000/api'
const RUN = `E2E-BOOKING-PRDUI-${Date.now().toString(36).toUpperCase()}`
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
const toastShown = (page, re, t = 10000) => page.getByText(re).first().waitFor({ timeout: t }).then(() => true).catch(() => false)
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
const dt = (n, hh = '10:00') => `${day(n)}T${hh}`

const PNG_PATH = fileURLToPath(new URL('./tiny.png', import.meta.url))
writeFileSync(PNG_PATH, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'))

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
context.setDefaultTimeout(30000)
const page = await context.newPage()
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${m.text()} @ ${page.url()}`) })
page.on('pageerror', (e) => { if (!/negative time stamp/i.test(e.message)) consoleErrors.push(`PAGEERROR ${e.message} @ ${page.url()}`) })

const api = async (method, path, data) => {
  const res = await context.request.fetch(API + path, { method, data, headers: { 'content-type': 'application/json' } })
  return { status: res.status(), json: await res.json().catch(() => null) }
}

const fieldInput = (labelRe, nth = 0) => page.locator('label').filter({ hasText: labelRe }).nth(nth).locator('xpath=..').locator('input, textarea').first()
async function pick(labelRe, optionText, { nth = 0 } = {}) {
  const root = page.locator('label').filter({ hasText: labelRe }).nth(nth).locator('xpath=..')
  await root.locator('button').first().click()
  await root.locator('div.absolute button').filter({ hasText: optionText }).first().click()
}
const stepBtn = (i) => page.locator('div.overflow-x-auto.border.border-ink\\/25.bg-card button').nth(i)
const gotoStep = async (i) => { await stepBtn(i).click(); await page.waitForTimeout(200) }
async function waitUntil(fn, { timeout = 10000, interval = 200 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await fn()) return true
    await page.waitForTimeout(interval)
  }
  return false
}
const isBookingSaveUrl = (url) => /\/export\/bookings\/[0-9a-f]{24}$/.test(new URL(url).pathname)
const isBlSaveUrl = (url) => /\/export\/bookings\/[0-9a-f]{24}\/bl$/.test(new URL(url).pathname)
async function saveAndWait(buttonName, urlTest) {
  const [, res] = await Promise.all([
    page.waitForRequest((r) => urlTest(r.url()) && r.method() === 'PUT', { timeout: 15000 }),
    page.waitForResponse((r) => urlTest(r.url()) && r.request().method() === 'PUT', { timeout: 15000 }),
    page.getByRole('button', { name: buttonName }).click(),
  ])
  await page.waitForTimeout(500)
  return res
}
const saveBooking = () => saveAndWait('Save Booking details', isBookingSaveUrl)
const saveBl = () => saveAndWait('Save B&L details', isBlSaveUrl)
const panelStatus = (n) => page.getByTestId(`step-status-${n}`)
const panelIssues = (n) => page.getByTestId(`step-issues-${n}`)
const clickComplete = async (n) => {
  await page.getByRole('button', { name: new RegExp(`^(Complete|Re-confirm) Step ${n}$`) }).click()
}
const jobState = async (id) => (await api('GET', `/export/bookings/${id}`)).json?.state

const seed = { bookingIds: [], jobNos: [], hblNumbers: [], portIds: [], typeIds: [], voIds: [] }
let db
try {
  // ─── login ──────────────────────────────────────────────────────────
  await page.goto(`${WEB}/login`)
  await page.locator('input[type="email"]').fill(process.env.ADMIN_EMAIL)
  await page.locator('input[type="password"], input[type="text"]').last().fill(process.env.ADMIN_DEFAULT_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {})
  check('UI login succeeds', !page.url().includes('/login'), page.url())

  const list = async (p) => (await api('GET', p)).json?.data || []
  const ports = await list('/master/ports')
  const nvocc = (await list('/master/nvoccs'))[0]
  const depot = (await list('/master/depots'))[0]
  const polPort = ports.find((p) => !/egypt/i.test(p.country || '')) || ports[0]
  let r = await api('POST', '/master/ports', { name: `${RUN} Port`, code: 'ZEU', country: 'Egypt' })
  const egPort = r.json?.data
  seed.portIds.push(egPort._id)
  r = await api('POST', '/master/container-types', { code: '20ZU', label: `${RUN} 20ft`, maxPayloadKg: 28000, capacityCbm: 33, tareWeightKg: 2300 })
  const tType = r.json?.data
  seed.typeIds.push(tType._id)
  r = await api('POST', '/master/vessel-operators', { name: `${RUN} VO`, code: 'E2UV' })
  const vo = r.json?.data
  seed.voIds.push(vo._id)
  r = await api('POST', '/master/containers/quick-add', { containerType: tType._id, nvocc: nvocc._id, depot: depot._id, quantity: 2 })
  check('seeded temp port, container type, VO and 2 units of stock', !!egPort && !!tType && !!vo && r.status === 201, JSON.stringify(r.json))

  r = await api('POST', '/export/bookings', {
    clientName: `${RUN} Client`, clientPhone: '+20100000000', clientEmail: 'prdui@example.com',
    pol: polPort._id, pod: egPort._id, commodity: 'Frozen poultry', containers: [{ containerType: tType._id, quantity: 2 }], nvocc: nvocc._id,
    hsCode: '0207.14', packagesCount: 400, packageType: 'Cartons', grossWeight: 40000, netWeight: 38000,
    shipper: { name: 'PRDUI Shipper', address: 'Shipper street 1' }, consignee: { name: 'PRDUI Consignee Company Limited', address: 'Consignee street 2' }, notify: { name: 'PRDUI Notify' },
    podAgent: { name: 'PRDUI Agent', email: 'prdui-agent@example.com' },
  })
  const job = r.json?.data
  seed.bookingIds.push(job._id)
  seed.jobNos.push(job.jobNo)
  check('job created through the API for the walkthrough', r.status === 201, JSON.stringify(r.json))

  await page.goto(`${WEB}/export/bookings/${job._id}`)
  await page.getByTestId('step-panel-1').waitFor({ timeout: 90000 })

  // ═══ Step 1 ═════════════════════════════════════════════════════════
  check('Step 1 panel: "In progress", Complete disabled, the missing items are listed', (await panelStatus(1).textContent()).includes('In progress')
    && await page.getByRole('button', { name: 'Complete Step 1' }).isDisabled() && (await panelIssues(1).textContent()).includes('Proforma invoice number'))
  check('the issues name the Egypt ACID rule', (await panelIssues(1).textContent()).includes('ACID'))
  check('lifecycle chip shows the job stage', (await page.getByTestId('lifecycle-stage').textContent()).includes('Job opened'))
  check('ACID field is shown for an Egypt destination', await vis(page.getByLabel('ACID number')))
  check('Step 1 has the new customs fields (cargo readiness, proforma, stuffing, CBM)', await vis(page.getByLabel('Cargo readiness date')) && await vis(page.getByLabel('Proforma invoice number')) && await vis(page.getByLabel('Total CBM')))

  await page.getByLabel('Cargo readiness date').fill(day(-6))
  await page.getByLabel('Proforma invoice number').fill('PI-UI-1')
  await page.getByLabel('Proforma invoice date').fill(day(-7))
  await page.getByLabel('ACID number').fill('1234567890123456789')
  await page.getByLabel('Total CBM').fill('50')
  await pick(/^Country of Origin/, 'Egypt')
  await pick(/^Stuffing Location/, 'Depot CFS')
  await saveBooking()
  const savedStep1 = (await api('GET', `/export/bookings/${job._id}`)).json?.data
  check('Step 1 fields saved from the UI', savedStep1?.proformaInvoiceNo === 'PI-UI-1' && savedStep1?.acidNumber === '1234567890123456789' && savedStep1?.countryOfOrigin === 'Egypt' && savedStep1?.stuffingLocationType === 'Depot CFS' && savedStep1?.cbm === 50, JSON.stringify([savedStep1?.proformaInvoiceNo, savedStep1?.countryOfOrigin]))
  check('after saving, the list of missing items is gone and Complete is enabled', await waitUntil(async () => (await page.getByTestId('step-issues-1').count()) === 0 && await page.getByRole('button', { name: 'Complete Step 1' }).isEnabled()))

  await clickComplete(1)
  check('Complete Step 1 -> status "Complete" and the step bar checkmark', await waitUntil(async () => (await panelStatus(1).textContent()).includes('Complete')) && (await stepBtn(0).getAttribute('data-complete')) === 'true')
  check('the lifecycle chip moves to "S/D Prelim Complete"', await waitUntil(async () => (await page.getByTestId('lifecycle-stage').textContent()).includes('S/D Prelim Complete')))
  check('a completed step is read-only in the form (commodity is disabled)', await fieldInput(/^Commodity/).isDisabled())
  check('...and Amend replaces Complete', await vis(page.getByRole('button', { name: 'Amend' })) && (await page.getByRole('button', { name: 'Complete Step 1' }).count()) === 0)

  await page.getByRole('button', { name: 'Amend' }).click()
  check('Amend asks for a reason (the confirm button stays disabled until one is typed)', await vis(page.getByRole('heading', { name: 'Amend Step 1?' })) && await page.getByRole('button', { name: 'Amend step' }).isDisabled())
  await page.getByLabel('Reason', { exact: true }).fill('shipper corrected the packaging')
  await page.getByRole('button', { name: 'Amend step' }).click()
  check('Amend reopens the step', await waitUntil(async () => (await panelStatus(1).textContent()).includes('In progress')) && await waitUntil(() => fieldInput(/^Commodity/).isEnabled()))
  check('...and the amendment is recorded', ((await api('GET', `/export/bookings/${job._id}`)).json?.data?.amendments || []).some((a) => a.step === 1 && /packaging/.test(a.reason)))
  await clickComplete(1)
  await waitUntil(async () => (await panelStatus(1).textContent()).includes('Complete'))

  // ═══ Step 2 ═════════════════════════════════════════════════════════
  await gotoStep(1)
  check('Step 2 shows the read-only Job Summary and the fixed SOC booking type', await vis(page.getByTestId('job-summary')) && (await page.getByTestId('job-summary').textContent()).includes(job.jobNo) && await vis(page.getByText('SOC', { exact: true })))
  check('Step 2 cannot complete before it is filled in (issues listed)', (await panelIssues(2).textContent()).includes('VO / master booking reference') && await page.getByRole('button', { name: 'Complete Step 2' }).isDisabled())
  // vessel + dates through the API (the vessel list needs vessel master data), the rest through the UI
  r = await api('PUT', `/export/bookings/${job._id}`, {
    carrier: vo._id, vesselName: 'MV PRDUI', voyageNo: 'V9', carrierBookingRef: `${RUN}-BR`, etd: new Date(Date.now() + 10 * 86400000).toISOString(), eta: new Date(Date.now() + 25 * 86400000).toISOString(),
    siCutoff: new Date(Date.now() + 7 * 86400000).toISOString(), vgmCutoff: new Date(Date.now() + 7 * 86400000).toISOString(), cyGateInCutoff: new Date(Date.now() + 8 * 86400000).toISOString(),
  })
  await page.reload()
  await page.getByTestId('step-panel-1').waitFor({ timeout: 60000 })
  await gotoStep(1)
  await fieldInput(/^POL Terminal/).fill('Terminal A')
  await fieldInput(/^POD Terminal/).fill('TBA')
  await page.getByRole('button', { name: 'Same as requested' }).click()
  await pick(/^Space Confirmation Status/, 'Confirmed')
  await page.locator('label').filter({ hasText: /^Booking Confirmation File/ }).locator('xpath=following-sibling::label[1]').locator('input[type="file"]').setInputFiles(PNG_PATH)
  await saveBooking()
  const savedStep2 = (await api('GET', `/export/bookings/${job._id}`)).json?.data
  check('Step 2 fields saved (terminals, confirmed equipment, status, VO confirmation file)', savedStep2?.polTerminal === 'Terminal A' && savedStep2?.confirmedEquipment?.[0]?.quantity === 2 && savedStep2?.spaceConfirmationStatus === 'Confirmed' && !!savedStep2?.bookingConfirmationFile?.fileName, JSON.stringify([savedStep2?.polTerminal, savedStep2?.confirmedEquipment]))
  check('ATD is a read-only echo in Step 2 (it is entered in Step 5)', await vis(page.getByText('ATD (recorded in Step 5)')) && (await page.getByLabel('ATD', { exact: true }).count()) === 0)
  await clickComplete(2)
  check('Complete Step 2 (the VO booking)', await waitUntil(async () => (await panelStatus(2).textContent()).includes('Complete')))

  // roll-over
  await page.getByRole('button', { name: 'Roll over / change vessel' }).click()
  await page.getByLabel('Reason', { exact: true }).fill('vessel omitted the port call')
  await page.getByRole('button', { name: 'Roll over', exact: true }).click()
  check('Roll-over: a version is recorded, status becomes Rolled and Step 2 is reopened', await waitUntil(async () => (await page.getByTestId('booking-versions').textContent()).includes('vessel omitted the port call')) && (await panelStatus(2).textContent()).includes('In progress'))
  check('the lifecycle chip shows the Rolled exception', (await page.getByTestId('lifecycle-stage').textContent()).includes('Rolled'))
  await pick(/^Space Confirmation Status/, 'Confirmed')
  await saveBooking()
  await clickComplete(2)
  check('after the new sailing is confirmed, Step 2 completes again', await waitUntil(async () => (await panelStatus(2).textContent()).includes('Complete')))

  // ═══ Step 3 ═════════════════════════════════════════════════════════
  await gotoStep(2)
  check('Step 3 shows the read-only Requirement card and the Release Order block', await vis(page.getByTestId('requirement')) && await vis(page.getByTestId('release-order')))
  await pick(/^Depot$/, depot.code)
  await page.getByLabel('CRO number').fill('CRO-UI-1')
  await page.getByLabel('CRO issue date').fill(day(-5))
  await page.getByLabel('CRO validity date').fill(day(5))
  await pick(/^CRO Issued By/, 'Carrier')
  await saveBooking()
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm Booking' }).click()
  await toastShown(page, /Booking confirmed/)
  await page.reload()
  await page.getByTestId('step-panel-1').waitFor({ timeout: 60000 })
  await gotoStep(2)
  check('after Confirm the container grid shows one card per allocated container', await waitUntil(async () => (await page.getByTestId('unit-card').count()) === 2))

  const fillCard = async (n, v) => {
    const card = page.getByTestId('unit-card').nth(n)
    await card.getByLabel('Seal No').fill(v.seal)
    await card.getByLabel('Payload weight').fill(String(v.payload))
    await card.getByLabel('Container CBM').fill(String(v.cbm))
    await card.getByLabel('Packages in container').fill(String(v.pkgs))
    await card.locator('label').filter({ hasText: /^VGM method/ }).first().locator('xpath=..').locator('button').first().click()
    await card.locator('div.absolute button').filter({ hasText: 'Method 2' }).first().click()
    await card.getByLabel('Packing weight').fill('100')
    await card.getByLabel('VGM declared by').fill('PRDUI Signatory')
    await card.getByLabel('VGM submitted').fill(dt(-2))
    await card.locator('label').filter({ hasText: /^Condition at gate-out/ }).first().locator('xpath=..').locator('button').first().click()
    await card.locator('div.absolute button').filter({ hasText: 'Sound' }).first().click()
    await card.getByLabel('Gate-out date').fill(dt(-3))
    await card.getByLabel('Gate-in date').fill(dt(-2))
    await card.getByRole('button', { name: /^Save / }).click()
    await toastShown(page, /saved/)
    await page.waitForTimeout(600)
  }
  await fillCard(0, { seal: 'SEAL-U1', payload: 20000, cbm: 25, pkgs: 200 })
  const card0 = page.getByTestId('unit-card').nth(0)
  const vgmProbe = await card0.evaluate((el) => ({
    vgm: [...el.querySelectorAll('[aria-label="VGM weight"]')].map((n) => n.tagName + ':' + (n.value ?? n.textContent)),
    packing: el.querySelector('[aria-label="Packing weight"]')?.value,
    payload: el.querySelector('[aria-label="Payload weight"]')?.value,
  }))
  check('VGM method 2 is calculated: tare 2300 + payload 20000 + packing 100 = 22400', JSON.stringify(vgmProbe).includes('22400'), JSON.stringify(vgmProbe))
  await fillCard(1, { seal: 'SEAL-U2', payload: 10000, cbm: 12, pkgs: 100 })
  check('reconciliation panel flags the weight, volume and packages that do not match the declared totals', await waitUntil(async () => (await page.getByTestId('recon-weight').textContent()).includes('Variance')) && (await page.getByTestId('recon-count').textContent()).includes('OK') && (await page.getByTestId('recon-packages').textContent()).includes('Variance'))
  check('...and Step 3 cannot complete yet', await page.getByRole('button', { name: 'Complete Step 3' }).isDisabled() && (await panelIssues(3).textContent()).includes('Reconciliation'))
  await fieldInput(/^Variance Reason/).fill('second box part-loaded, agreed with the shipper')
  await saveBooking()
  await clickComplete(3)
  check('with a variance reason Step 3 completes and locks (container cards become read-only)', await waitUntil(async () => (await panelStatus(3).textContent()).includes('Complete')) && await waitUntil(() => page.getByTestId('unit-card').nth(0).getByLabel('Seal No').isDisabled()))

  // ═══ Step 4 ═════════════════════════════════════════════════════════
  await gotoStep(3)
  check('Step 4 shows the read-only voyage & container summary with the container seals', await vis(page.getByTestId('voyage-summary')) && (await page.getByTestId('voyage-summary').textContent()).includes('SEAL-U1'))
  const exactConsignee = page.getByLabel('Exact Consignee')
  const wrapped = (await exactConsignee.inputValue()).split('\n')
  check('Final Parties default from the Step 1 snapshot, word-wrapped to the 35-character EDI width', wrapped.length >= 2 && wrapped.every((l) => l.length <= 35) && wrapped.join(' ').includes('PRDUI Consignee Company Limited'.slice(0, 20)), JSON.stringify(wrapped))
  check('the line / character counter is shown', await vis(page.getByText(/\/5 lines · longest \d+\/35 characters/)))
  await page.getByLabel('Marks and numbers').fill('N/M')
  await page.getByLabel('Commercial invoice no').fill('CI-UI-1')
  await page.getByLabel('Commercial invoice date').fill(day(-3))
  await page.getByLabel('Customs declaration no').fill('CD-UI-1')
  await page.getByLabel('SI submitted to VO').fill(dt(-8))
  check('the final totals show a variance badge against Step 1 only when they differ', (await page.getByTestId('variance-badge').count()) === 0)
  await page.getByLabel('Final gross weight').fill('40500')
  check('...changing a final total shows the badge', await vis(page.getByTestId('variance-badge')))
  await page.getByLabel('Final gross weight').fill('40000')
  await page.getByLabel('Final variance reason').fill('second box part-loaded, packing list attached')
  await saveBl()
  await page.getByRole('button', { name: 'Generate Draft B/L' }).click()
  check('Generate Draft B/L records version 1 and restarts the approval', await waitUntil(async () => (await page.getByTestId('draft-version').textContent()).trim() === 'v1') && (await page.getByTestId('draft-history').textContent()).includes('Draft v1'))
  const [draftDownload] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.getByRole('button', { name: 'Download draft PDF' }).click()])
  check('the draft B/L PDF downloads', /\.pdf$/i.test(draftDownload.suggestedFilename()), draftDownload.suggestedFilename())

  check('Step 4 cannot complete before the shipper approves', await page.getByRole('button', { name: 'Complete Step 4' }).isDisabled() && (await panelIssues(4).textContent()).includes('Approved'))
  await pick(/^Shipper Approval Status/, 'Approved')
  await page.getByLabel('Approval date').fill(day(-1))
  await page.getByLabel('Approved by').fill('Shipper Rep')
  await saveBl()
  await clickComplete(4)
  check('Complete Step 4 (Final S/D approved) locks the B/L content', await waitUntil(async () => (await panelStatus(4).textContent()).includes('Complete')) && await waitUntil(() => page.getByLabel('Exact Shipper').isDisabled()))
  check('the lifecycle chip moves to "Final S/D Approved"', (await page.getByTestId('lifecycle-stage').textContent()).includes('Final S/D Approved'))

  // ═══ Step 5 ═════════════════════════════════════════════════════════
  await gotoStep(4)
  check('Issue HBL is disabled and says why', await page.getByRole('button', { name: 'Issue HBL' }).isDisabled() && (await vis(page.getByTestId('issue-reason'))))
  check('Pre-alert is disabled until the HBL is issued', await page.getByRole('button', { name: 'Pre-Alert Destination Agent' }).isDisabled())
  check('the loading list is ready (every container has a seal, VGM and gate-in)', await waitUntil(() => page.getByRole('button', { name: 'Generate Terminal Loading List' }).isEnabled()))
  const [llDownload] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.getByRole('button', { name: 'Generate Terminal Loading List' }).click()])
  check('the terminal loading list downloads as an Excel file', /\.xlsx$/i.test(llDownload.suggestedFilename()), llDownload.suggestedFilename())
  check('the DG manifest is disabled for a non-DG job', await page.getByRole('button', { name: 'Generate DG Manifest' }).isDisabled())

  await pick(/^Freight Terms/, 'Freight Prepaid')
  await pick(/^Freight Payable At/, 'Origin')
  await pick(/^Freight Payment Status/, 'Paid')
  await page.getByLabel('ATD', { exact: true }).fill(day(-1))
  await page.getByLabel('Shipped on board').fill(day(-1))
  await fieldInput(/^Place of Issue/).fill('Cairo')
  await fieldInput(/^Date of Issue/).fill(day(0))
  await page.getByLabel('Signatory name').fill('PRDUI Signer')
  await page.getByLabel('Signatory title').fill('Manager')
  await saveBl()
  check('after saving, Issue HBL is enabled', await waitUntil(() => page.getByRole('button', { name: 'Issue HBL' }).isEnabled()))
  await page.getByRole('button', { name: 'Issue HBL' }).click()
  check('Issue HBL: the issued banner appears with an auto-generated HBL number and the job is locked', await vis(page.getByTestId('hbl-issued-banner'), 20000) && /HBL \S+ issued \(version 1\)/.test(await page.getByTestId('hbl-issued-banner').textContent()))
  const issued = (await api('GET', `/export/bookings/${job._id}`)).json?.data
  if (issued?.hblNumber) seed.hblNumbers.push(issued.hblNumber)
  check('the lifecycle chip shows "BL Issued", the step bar marks Step 5 and the container units are Departed', (await page.getByTestId('lifecycle-stage').textContent()).includes('BL Issued') && (await stepBtn(4).getAttribute('data-complete')) === 'true'
    && ((await api('GET', `/master/containers?booking=${job._id}`)).json?.data || []).every((u) => u.containerStatus === 'Departed'))
  await gotoStep(0)
  check('after issue every earlier step is locked and Amend is gone', await fieldInput(/^Commodity/).isDisabled() && (await page.getByRole('button', { name: 'Amend' }).count()) === 0)
  await gotoStep(4)
  const [hblDownload] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.getByRole('button', { name: 'Download HBL PDF' }).click()])
  check('the final HBL PDF downloads', /\.pdf$/i.test(hblDownload.suggestedFilename()), hblDownload.suggestedFilename())
  check('Pre-alert is still disabled (no MBL number yet) and says so', await page.getByRole('button', { name: 'Pre-Alert Destination Agent' }).isDisabled())

  await page.getByRole('button', { name: 'Re-issue HBL' }).click()
  await page.getByLabel('Reason', { exact: true }).fill('consignee spelling corrected')
  await page.getByRole('button', { name: 'Re-open for re-issue' }).click()
  check('Re-issue reopens Step 5, keeps the replaced HBL in the history', await waitUntil(async () => (await page.getByTestId('hbl-issued-banner').count()) === 0) && await vis(page.getByText(/replaced .*consignee spelling corrected/)))
  await page.getByLabel('MBL number').fill(`${RUN}-MBL`)
  await page.getByLabel('MBL shipper').fill('PRDUI Carrier')
  await page.getByLabel('MBL consignee').fill('PRDUI Agent')
  await saveBl()
  await page.getByRole('button', { name: 'Issue HBL' }).click()
  check('issuing again produces version 2 with the same HBL number', await vis(page.getByTestId('hbl-issued-banner'), 20000) && (await page.getByTestId('hbl-issued-banner').textContent()).includes('version 2') && (await page.getByTestId('hbl-issued-banner').textContent()).includes(issued.hblNumber))
  check('Pre-alert becomes available once the MBL data exists', await waitUntil(() => page.getByRole('button', { name: 'Pre-Alert Destination Agent' }).isEnabled()))
  await page.getByRole('button', { name: 'Pre-Alert Destination Agent' }).click()
  check('Pre-alert is logged with the POD agent e-mail and the lifecycle becomes "Pre-alerted"', await vis(page.getByTestId('pre-alert-log'), 15000) && (await page.getByTestId('pre-alert-log').textContent()).includes('prdui-agent@example.com') && await waitUntil(async () => (await page.getByTestId('lifecycle-stage').textContent()).includes('Pre-alerted')))
  await page.getByRole('button', { name: 'Mark pre-alert acknowledged' }).click()
  check('the pre-alert can be acknowledged', await waitUntil(async () => (await page.getByTestId('pre-alert-log').textContent()).includes('acknowledged')))
  check('the generated documents are logged', (await page.getByTestId('document-history').textContent()).includes('Loading list') && (await page.getByTestId('document-history').textContent()).includes('Draft B/L'))
  await page.screenshot({ path: fileURLToPath(new URL(`./shots/${RUN}-step5.png`, import.meta.url)), fullPage: true })

  const finalState = await jobState(job._id)
  check('server state agrees: Pre-alerted, 5 steps complete', finalState?.lifecycle?.stage === 'Pre-alerted' && finalState?.stepsCompleted?.length === 5, JSON.stringify(finalState?.lifecycle))
  const noise = /favicon|401|403|negative time stamp/
  const realErrors = consoleErrors.filter((e) => !noise.test(e))
  check('no browser console / page errors during the run', realErrors.length === 0, realErrors.slice(0, 3).join(' | '))
} catch (err) {
  check('UI run completed without an unexpected error', false, err.stack || err.message)
} finally {
  try {
    await mongoose.connect(process.env.MONGO_URI)
    db = mongoose.connection.db
    const oid = (id) => new mongoose.Types.ObjectId(id)
    const delUnits = seed.typeIds.length ? await db.collection('containers').deleteMany({ containerType: { $in: seed.typeIds.map(oid) } }) : { deletedCount: 0 }
    const delBookings = seed.bookingIds.length ? await db.collection('bookings').deleteMany({ _id: { $in: seed.bookingIds.map(oid) } }) : { deletedCount: 0 }
    if (seed.typeIds.length) await db.collection('containertypes').deleteMany({ _id: { $in: seed.typeIds.map(oid) } })
    if (seed.voIds.length) await db.collection('vesseloperators').deleteMany({ _id: { $in: seed.voIds.map(oid) } })
    if (seed.portIds.length) await db.collection('ports').deleteMany({ _id: { $in: seed.portIds.map(oid) } })
    const year = new Date().getFullYear()
    for (const jobNo of [...seed.jobNos].reverse()) {
      const seq = Number(/-(\d+)$/.exec(jobNo)?.[1])
      if (!seq) continue
      const res = await db.collection('jobcounters').updateOne({ _id: `job-${year}`, seq }, { $inc: { seq: -1 } })
      if (!res.modifiedCount) break
    }
    for (const n of seed.hblNumbers) {
      const m = /^(.*?)(\d{2})(\d{5})$/.exec(n)
      if (m) await db.collection('jobcounters').updateOne({ _id: `hbl-${m[1]}-${m[2]}`, seq: Number(m[3]) }, { $inc: { seq: -1 } })
    }
    console.log(`cleanup: removed ${delBookings.deletedCount} booking(s), ${delUnits.deletedCount} container unit(s), ${seed.portIds.length} port(s), ${seed.typeIds.length} container type(s), ${seed.voIds.length} VO(s)`)
    await mongoose.disconnect()
  } catch (e) { console.log('CLEANUP FAILED — remove E2E-BOOKING-PRDUI data by hand:', e.message) }
  await browser.close()
  const failed = results.filter((x) => !x.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed, run=${RUN}`)
  process.exitCode = failed.length ? 1 : 0
}
