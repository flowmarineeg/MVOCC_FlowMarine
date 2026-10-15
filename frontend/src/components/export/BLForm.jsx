'use client'

import { useState } from 'react'
import Select from '@/components/ui/Select'
import SummaryCard from './SummaryCard'
import { BL_STEP_FIELDS, dropLockedFields } from '@/constants/jobSteps'

const toDateInput = (d) => {
  if (!d) return ''
  return (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10)
}

// local date-time for <input type="datetime-local"> (built from local parts, not toISOString())
const toDateTimeInput = (d) => {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const formatDateTime = (d) => (d ? new Date(d).toLocaleString() : '-')

const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

const APPROVAL_OPTIONS = [
  { value: 'Pending', label: 'Pending' },
  { value: 'Confirmed', label: 'Approved' },
  { value: 'Amendments Requested', label: 'Amendments Requested' },
]
const BL_TYPE_OPTIONS = ['Original 3/3', 'Seaway Bill', 'Express Release', 'Telex Release'].map((v) => ({ value: v, label: v }))
const FREIGHT_TERMS_OPTIONS = ['Freight Prepaid', 'Freight Collect'].map((v) => ({ value: v, label: v }))
const PAYABLE_AT_OPTIONS = ['Origin', 'Destination'].map((v) => ({ value: v, label: v }))
const PAYMENT_STATUS_OPTIONS = ['Paid', 'Unpaid', 'Credit Approved'].map((v) => ({ value: v, label: v }))
const MBL_RELEASE_OPTIONS = ['Original', 'Telex Release', 'Seaway Bill'].map((v) => ({ value: v, label: v }))
const SENT_STATUS_OPTIONS = ['Pending', 'Sent'].map((v) => ({ value: v, label: v }))
const MANIFEST_STATUS_OPTIONS = ['N/A', 'Pending', 'Sent'].map((v) => ({ value: v, label: v }))
const INVOICE_STATUS_OPTIONS = ['Draft', 'Issued', 'Paid'].map((v) => ({ value: v, label: v }))

const TEXT_FIELDS = [
  'elHarkaRepName', 'exportCustomsDeclarationNo', 'hblNumber', 'mblNumber', 'notifyPartyName', 'notifyPartyAddress', 'destinationAgentDetails',
  'placeOfIssue', 'exactShipper', 'exactConsignee', 'exactNotify', 'alsoNotify', 'marksAndNumbers', 'exactDescription', 'finalPackageType',
  'placeOfReceipt', 'placeOfDelivery', 'lcDetails', 'blRemarks', 'commercialInvoiceNo', 'certificateOfOriginNo', 'voSiReference',
  'approvedBy', 'amendmentNotes', 'finalVarianceReason', 'holdOverrideReason', 'freightTermsOverrideReason', 'sobVarianceReason',
  'signatoryName', 'signatoryTitle', 'courierAwb', 'mblShipper', 'mblConsignee', 'mblNotify',
]
const DATE_FIELDS = [
  'certificateReceivedDate', 'telexReleaseSentDate', 'dateOfIssue', 'customerNotifiedDate', 'commercialInvoiceDate', 'customsReleaseDate',
  'approvedAt', 'atd', 'shippedOnBoardDate', 'blReleaseDate', 'mblIssueDate',
]
const NUMBER_FIELDS = ['numberOfOriginalBLs', 'finalTotalPackages', 'finalGrossWeight', 'finalCbm']
const SELECT_FIELDS = ['freightTermsOnBL', 'freightPayableAt', 'freightPaymentStatus', 'mblReleaseType', 'mblFreightTerms']

// Word-wraps a text to the EDI width of the exact party fields (35 characters, 5 lines).
function wrapLines(text, width = 35, maxLines = 5) {
  const out = []
  for (const para of String(text || '').split(/\r?\n/)) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (line && line.length + 1 + word.length > width) { out.push(line); line = word } else line = line ? `${line} ${word}` : word
      while (line.length > width) { out.push(line.slice(0, width)); line = line.slice(width) }
    }
    if (line) out.push(line)
  }
  return out.slice(0, maxLines).join('\n')
}

function buildInitialForm(booking) {
  const f = {
    customsCertificateFile: null,
    consigneeToOrder: !!booking.consigneeToOrder,
    clientConfirmationStatus: booking.clientConfirmationStatus || 'Pending',
    blType: booking.blType || 'Telex Release',
    shippersLoadStowCount: booking.shippersLoadStowCount !== false,
    siSubmittedToVoAt: toDateTimeInput(booking.siSubmittedToVoAt),
    finalLoadListStatus: booking.finalLoadListStatus || 'Pending',
    dgManifestRequired: !!booking.dgManifestRequired,
    dgManifestStatus: booking.dgManifestStatus || 'N/A',
    reeferManifestRequired: !!booking.reeferManifestRequired,
    reeferManifestStatus: booking.reeferManifestStatus || 'N/A',
    paymentRequestSent: !!booking.paymentRequestSent,
    invoiceStatus: booking.invoiceStatus || 'Draft',
    preAlertSent: !!booking.preAlertSent,
    subManifestNafezaSubmitted: !!booking.subManifestNafezaSubmitted,
    subManifestIssuedSent: !!booking.subManifestIssuedSent,
    podAgentUpdateLog: (booking.podAgentUpdateLog || []).map((e) => ({ _id: e._id, date: toDateInput(e.date), note: e.note || '' })),
  }
  for (const k of TEXT_FIELDS) f[k] = booking[k] || ''
  for (const k of DATE_FIELDS) f[k] = toDateInput(booking[k])
  for (const k of NUMBER_FIELDS) f[k] = booking[k] ?? ''
  for (const k of SELECT_FIELDS) f[k] = booking[k] || ''
  // the exact texts default from the Step 1 snapshot until somebody types them (G2)
  const snap = (p) => wrapLines([p?.name, p?.address].filter(Boolean).join('\n'))
  if (!f.exactShipper) f.exactShipper = snap(booking.shipper)
  if (!f.exactConsignee) f.exactConsignee = snap(booking.consignee)
  if (!f.exactNotify) f.exactNotify = snap(booking.notify)
  if (!f.exactDescription) f.exactDescription = booking.commodity || ''
  if (f.finalTotalPackages === '' && booking.packagesCount != null) f.finalTotalPackages = booking.packagesCount
  if (f.finalGrossWeight === '' && booking.grossWeight != null) f.finalGrossWeight = booking.grossWeight
  if (f.finalCbm === '' && booking.cbm != null) f.finalCbm = booking.cbm
  if (!f.finalPackageType) f.finalPackageType = booking.packageType || ''
  if (!f.marksAndNumbers) f.marksAndNumbers = ''
  if (!f.signatoryName) f.signatoryName = ''
  return f
}

const labelCls = 'mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted'
const inputCls = 'w-full border bg-card px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust'
const sectionCls = 'space-y-5 border border-ink/25 bg-card p-5 sm:p-6'
const sectionTitleCls = 'font-display text-base font-bold uppercase tracking-wide text-ink'
const subTitleCls = 'font-mono text-xs font-bold uppercase tracking-[0.14em] text-rust'
const actionBtn = 'border border-ink/30 px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-40'

// Multi-line text with the EDI limits of the PRD (max 5 lines x 35 characters).
function PartyText({ label, value, onChange, required = false, ariaLabel }) {
  const lines = value ? value.split(/\r?\n/) : []
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0)
  const over = lines.length > 5 || longest > 35
  return (
    <div>
      <label className={labelCls}>{label} {required && <span className="text-rust">*</span>}</label>
      <textarea
        rows={4}
        aria-label={ariaLabel || label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} font-mono ${over ? 'border-brick' : 'border-ink/30'}`}
      />
      <p className={`mt-1 font-mono text-[10px] ${over ? 'text-brick' : 'text-muted'}`}>{lines.length}/5 lines · longest {longest}/35 characters</p>
    </div>
  )
}

function VarianceBadge({ show, children }) {
  if (!show) return null
  return <span className="ml-2 border border-signal px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide text-signal" data-testid="variance-badge">{children}</span>
}

// Step 4 (Final S/D) and Step 5 (BL & Loading List) B&L-owned blocks. The page owns the actions (draft /
// issue / pre-alert ...) and passes `onAction(name)`; this form saves the fields.
export default function BLForm({
  booking, activeStep, canUpdate = true, submitting = false, onSubmit,
  jobState = null, lockedSteps = [], actionStates = null, busyAction = null, onAction,
}) {
  const [form, setForm] = useState(() => buildInitialForm(booking))
  const [newLogDate, setNewLogDate] = useState('')
  const [newLogNote, setNewLogNote] = useState('')
  const [errors, setErrors] = useState({})

  const set = (field) => (v) => setForm((f) => ({ ...f, [field]: v }))
  const setInput = (field) => (e) => set(field)(e.target.value)
  const setChecked = (field) => (e) => set(field)(e.target.checked)
  const locked = (step) => lockedSteps.includes(step)
  const issued = !!booking.hblIssuedAt

  const closureUnlocked = !!booking.atd

  const handleFileChange = (e) => {
    const file = e.target.files?.[0] || null
    if (file && !ALLOWED_FILE_TYPES.includes(file.type)) {
      setErrors((prev) => ({ ...prev, customsCertificateFile: 'Only PDF or image files (JPG, PNG, WEBP) are allowed' }))
      e.target.value = ''
      return
    }
    setErrors((prev) => {
      const next = { ...prev }
      delete next.customsCertificateFile
      return next
    })
    set('customsCertificateFile')(file)
  }

  const addLogEntry = () => {
    if (!newLogDate) return
    set('podAgentUpdateLog')([...form.podAgentUpdateLog, { date: newLogDate, note: newLogNote.trim() }])
    setNewLogDate('')
    setNewLogNote('')
  }
  const removeLogEntry = (index) => set('podAgentUpdateLog')(form.podAgentUpdateLog.filter((_, i) => i !== index))

  const handleSubmit = (e) => {
    e.preventDefault()

    const fd = new FormData()
    // '' clears a saved value, so every text / date / number field is always sent
    for (const k of TEXT_FIELDS) fd.append(k, String(form[k] ?? '').trim())
    for (const k of DATE_FIELDS) fd.append(k, form[k] || '')
    for (const k of NUMBER_FIELDS) fd.append(k, form[k] === '' ? '' : String(form[k]))
    for (const k of SELECT_FIELDS) fd.append(k, form[k] || '')
    fd.append('siSubmittedToVoAt', form.siSubmittedToVoAt || '')
    fd.append('consigneeToOrder', String(form.consigneeToOrder))
    fd.append('shippersLoadStowCount', String(form.shippersLoadStowCount))
    fd.append('clientConfirmationStatus', form.clientConfirmationStatus)
    fd.append('blType', form.blType)
    fd.append('finalLoadListStatus', form.finalLoadListStatus)
    fd.append('dgManifestRequired', String(form.dgManifestRequired))
    fd.append('dgManifestStatus', form.dgManifestStatus)
    fd.append('reeferManifestRequired', String(form.reeferManifestRequired))
    fd.append('reeferManifestStatus', form.reeferManifestStatus)
    fd.append('paymentRequestSent', String(form.paymentRequestSent))
    fd.append('invoiceStatus', form.invoiceStatus)
    fd.append('preAlertSent', String(form.preAlertSent))
    fd.append('subManifestNafezaSubmitted', String(form.subManifestNafezaSubmitted))
    fd.append('subManifestIssuedSent', String(form.subManifestIssuedSent))
    fd.append('podAgentUpdateLog', JSON.stringify(form.podAgentUpdateLog.map(({ date, note }) => ({ date, note }))))
    if (form.customsCertificateFile) fd.append('customsCertificateFile', form.customsCertificateFile)
    // a completed step is locked on the server — never re-send its fields
    dropLockedFields(fd, lockedSteps, BL_STEP_FIELDS)

    onSubmit(fd)
  }

  const consigneeDisplay = form.consigneeToOrder ? 'To Order' : [booking.consignee?.name, booking.consignee?.address].filter(Boolean).join(' — ') || '-'

  // undefined activeStep -> every section always shown (kept for parity with
  // BookingForm; BLForm today is only ever used from the merged page, so
  // activeStep is always provided, but this keeps the component self-safe).
  const visible = (steps) => activeStep === undefined || steps.includes(activeStep)

  const units = jobState?.unitSummary || []
  const lastDraft = (booking.blDrafts || []).slice(-1)[0]
  const busy = (name) => busyAction === name
  const act = (name) => () => onAction?.(name)
  const states = actionStates || {}
  const docKinds = { 'loading-list': 'Loading list', 'dg-manifest': 'DG manifest', 'draft-hbl': 'Draft B/L', hbl: 'HBL' }

  const grossVar = booking.grossWeight != null && form.finalGrossWeight !== '' && Number(form.finalGrossWeight) !== Number(booking.grossWeight)
  const pkgVar = booking.packagesCount != null && form.finalTotalPackages !== '' && Number(form.finalTotalPackages) !== Number(booking.packagesCount)
  const cbmVar = booking.cbm != null && form.finalCbm !== '' && Number(form.finalCbm) !== Number(booking.cbm)
  const descVar = booking.commodity && form.exactDescription.trim() !== booking.commodity.trim()
  const hold = form.freightTermsOnBL === 'Freight Prepaid' && form.freightPaymentStatus === 'Unpaid'
  // the final totals are reconciled against what was actually loaded (BR-4.2): off by more than 2% needs a reason
  const sumUnits = (k) => units.reduce((t, u) => t + (Number(u[k]) || 0), 0)
  const offUnits = (final, actual, tolerant = true) => final !== '' && actual > 0 && (tolerant ? Math.abs(Number(final) - actual) > actual * 0.02 : Number(final) !== actual)
  const finalOffContainers = offUnits(form.finalTotalPackages, sumUnits('packages'), false) || offUnits(form.finalGrossWeight, sumUnits('payloadKg')) || offUnits(form.finalCbm, sumUnits('cbm'))

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset disabled={!canUpdate} className="space-y-6">
        {/* Context recap — read-only, pulled from the booking. Shown on both
            Step 4 (Final S/D) and Step 5 (BL & Loading List). */}
        <div className={`${sectionCls} ${visible([4, 5]) ? '' : 'hidden'}`}>
          <h2 className={sectionTitleCls}>Job Context</h2>
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 border border-ink/20 bg-paper/60 p-4 text-sm sm:grid-cols-3">
            <div>
              <span className={labelCls}>Job No</span>
              <p className="font-mono text-ink">{booking.jobNo}</p>
            </div>
            <div>
              <span className={labelCls}>Client</span>
              <p className="text-ink">{booking.clientName}</p>
            </div>
            <div>
              <span className={labelCls}>Quotation Ref</span>
              <p className="font-mono text-ink">{booking.quotation?.quotationNo || '-'}</p>
            </div>
            <div>
              <span className={labelCls}>Shipper (name — address)</span>
              <p className="text-ink">{[booking.shipper?.name, booking.shipper?.address].filter(Boolean).join(' — ') || '-'}</p>
            </div>
            <div>
              <span className={labelCls}>Consignee</span>
              <p className="text-ink">{consigneeDisplay}</p>
            </div>
            <div>
              <span className={labelCls}>Export / Import Tax No</span>
              <p className="font-mono text-ink">{booking.exportTaxNumber || '-'} / {booking.importTaxNumber || '-'}</p>
            </div>
          </div>
        </div>

        {/* Voyage & container summary — Step 4 (S4-01 .. S4-06), read-only */}
        <div className={visible([4]) ? '' : 'hidden'}>
          <SummaryCard
            testId="voyage-summary"
            title="Voyage & Container Summary (read-only)"
            items={[
              { label: 'Vessel', value: booking.vesselName },
              { label: 'Voyage', value: booking.voyageNo },
              { label: 'POL', value: booking.pol ? `${booking.pol.code} — ${booking.pol.name}` : '' },
              { label: 'POD', value: booking.pod ? `${booking.pod.code} — ${booking.pod.name}` : '' },
              { label: 'ETD', value: booking.etd ? formatDateTime(booking.etd) : '' },
              { label: 'Containers', value: units.length ? units.map((u) => `${u.containerNumber} (${u.type || ''}) seal ${u.sealNumber || '-'} · ${u.packages ?? '-'} pkgs · ${u.payloadKg ?? '-'} kg · ${u.cbm ?? '-'} CBM · VGM ${u.vgmKg ?? '-'}`).join('\n') : 'No containers allocated yet' },
            ]}
          />
        </div>

        {/* Customs Certificate — Step 4 (Final Shipping Declaration) */}
        <fieldset disabled={locked(4)} className={`${sectionCls} min-w-0 ${visible([4]) ? '' : 'hidden'}`}>
          <h2 className={sectionTitleCls}>Customs Certificate</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={labelCls}>El-Harka Representative Name</label>
              <input value={form.elHarkaRepName} onChange={setInput('elHarkaRepName')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Export Customs Declaration No <span className="text-rust">*</span></label>
              <input aria-label="Customs declaration no" value={form.exportCustomsDeclarationNo} onChange={setInput('exportCustomsDeclarationNo')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Certificate Received Date</label>
              <input type="date" value={form.certificateReceivedDate} onChange={setInput('certificateReceivedDate')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Certificate Upload <span className="normal-case text-muted/70">(optional, PDF or image)</span></label>
            <label className={`flex cursor-pointer items-center justify-between border bg-card px-3.5 py-2.5 text-sm text-muted transition-colors hover:border-ink/55 ${errors.customsCertificateFile ? 'border-brick' : 'border-ink/30'}`}>
              <span className="truncate">
                {form.customsCertificateFile ? form.customsCertificateFile.name : booking.customsCertificateFile?.fileName ? booking.customsCertificateFile.fileName : 'Choose file (PDF, JPG, PNG)…'}
              </span>
              <span className="ml-3 shrink-0 font-mono text-[10px] uppercase tracking-wide text-rust">Browse</span>
              <input type="file" accept="application/pdf,image/*" className="hidden" onChange={handleFileChange} />
            </label>
            {booking.customsCertificateFile?.fileName && !form.customsCertificateFile && (
              <p className="mt-1 text-xs text-muted">Currently attached — choose a new file to replace it.</p>
            )}
            {errors.customsCertificateFile && <p className="mt-1 font-mono text-xs text-brick">{errors.customsCertificateFile}</p>}
          </div>
        </fieldset>

        {/* Final Parties — Step 4 (S4-10 .. S4-13): editable text defaulting from the Step 1 snapshot */}
        <fieldset disabled={locked(4)} className={`${sectionCls} min-w-0 ${visible([4]) ? '' : 'hidden'}`} data-testid="final-parties">
          <h2 className={sectionTitleCls}>Final Parties</h2>
          <p className="font-mono text-xs text-muted">Exactly as they print on the B/L — up to 5 lines of 35 characters (EDI). &quot;TO ORDER&quot; and &quot;SAME AS CONSIGNEE&quot; are allowed.</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <PartyText label="Exact Shipper" required value={form.exactShipper} onChange={set('exactShipper')} />
            <PartyText label="Exact Consignee" required value={form.exactConsignee} onChange={set('exactConsignee')} />
            <PartyText label="Exact Notify" required value={form.exactNotify} onChange={set('exactNotify')} />
            <PartyText label="Also Notify" value={form.alsoNotify} onChange={set('alsoNotify')} />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={form.consigneeToOrder} onChange={setChecked('consigneeToOrder')} className="h-4 w-4" />
            Consignee is &quot;To Order&quot; <span className="normal-case text-muted/70">(instead of the named consignee above)</span>
          </label>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Notify Party Name</label>
              <input value={form.notifyPartyName} onChange={setInput('notifyPartyName')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Notify Party Address</label>
              <input value={form.notifyPartyAddress} onChange={setInput('notifyPartyAddress')} className={`${inputCls} border-ink/30`} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Destination Agent Details</label>
            <textarea rows={2} value={form.destinationAgentDetails} onChange={setInput('destinationAgentDetails')} className={`${inputCls} border-ink/30`} />
          </div>
        </fieldset>

        {/* Final Cargo — Step 4 (S4-20 .. S4-30) */}
        <fieldset disabled={locked(4)} className={`${sectionCls} min-w-0 ${visible([4]) ? '' : 'hidden'}`} data-testid="final-cargo">
          <h2 className={sectionTitleCls}>Final Cargo</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Marks &amp; Numbers <span className="text-rust">*</span> <span className="normal-case text-muted/70">(N/M allowed)</span></label>
              <textarea rows={2} aria-label="Marks and numbers" value={form.marksAndNumbers} onChange={setInput('marksAndNumbers')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Exact Commercial Description <span className="text-rust">*</span><VarianceBadge show={descVar}>differs from Step 1</VarianceBadge></label>
              <textarea rows={2} aria-label="Exact description" value={form.exactDescription} onChange={setInput('exactDescription')} className={`${inputCls} border-ink/30`} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
            <div>
              <label className={labelCls}>Final Total Packages <span className="text-rust">*</span><VarianceBadge show={pkgVar}>≠ {booking.packagesCount}</VarianceBadge></label>
              <input type="number" min="0" aria-label="Final total packages" value={form.finalTotalPackages} onChange={setInput('finalTotalPackages')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Final Gross Weight (kg) <span className="text-rust">*</span><VarianceBadge show={grossVar}>≠ {booking.grossWeight}</VarianceBadge></label>
              <input type="number" min="0" aria-label="Final gross weight" value={form.finalGrossWeight} onChange={setInput('finalGrossWeight')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Final Total CBM <span className="text-rust">*</span><VarianceBadge show={cbmVar}>≠ {booking.cbm}</VarianceBadge></label>
              <input type="number" min="0" aria-label="Final CBM" value={form.finalCbm} onChange={setInput('finalCbm')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Final Package Type <span className="text-rust">*</span></label>
              <input aria-label="Final package type" value={form.finalPackageType} onChange={setInput('finalPackageType')} className={`${inputCls} border-ink/30`} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Place of Receipt</label>
              <input aria-label="Place of receipt" value={form.placeOfReceipt} onChange={setInput('placeOfReceipt')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Place of Delivery</label>
              <input aria-label="Place of delivery" value={form.placeOfDelivery} onChange={setInput('placeOfDelivery')} className={`${inputCls} border-ink/30`} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={form.shippersLoadStowCount} onChange={setChecked('shippersLoadStowCount')} className="h-4 w-4" />
            Shipper&apos;s Load, Stow and Count (prints the SLAC remark)
          </label>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Letter of Credit Details</label>
              <textarea rows={2} aria-label="L/C details" value={form.lcDetails} onChange={setInput('lcDetails')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Additional B/L Remarks</label>
              <textarea rows={2} aria-label="B/L remarks" value={form.blRemarks} onChange={setInput('blRemarks')} className={`${inputCls} border-ink/30`} />
            </div>
          </div>
          {(finalOffContainers || form.finalVarianceReason) && (
            <div>
              <label className={labelCls}>Variance Reason <span className="text-rust">*</span> <span className="normal-case text-muted/70">(the final totals differ from the loaded containers by more than 2%)</span></label>
              <input aria-label="Final variance reason" value={form.finalVarianceReason} onChange={setInput('finalVarianceReason')} className={`${inputCls} border-ink/30`} />
            </div>
          )}
        </fieldset>

        {/* Compliance — Step 4 (S4-40 .. S4-44) */}
        <fieldset disabled={locked(4)} className={`${sectionCls} min-w-0 ${visible([4]) ? '' : 'hidden'}`} data-testid="compliance">
          <h2 className={sectionTitleCls}>Compliance</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
            <div>
              <label className={labelCls}>Commercial Invoice No <span className="text-rust">*</span></label>
              <input aria-label="Commercial invoice no" value={form.commercialInvoiceNo} onChange={setInput('commercialInvoiceNo')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Commercial Invoice Date <span className="text-rust">*</span></label>
              <input type="date" aria-label="Commercial invoice date" value={form.commercialInvoiceDate} onChange={setInput('commercialInvoiceDate')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Certificate of Origin No</label>
              <input aria-label="Certificate of origin no" value={form.certificateOfOriginNo} onChange={setInput('certificateOfOriginNo')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Customs Release Date</label>
              <input type="date" aria-label="Customs release date" value={form.customsReleaseDate} onChange={setInput('customsReleaseDate')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>
        </fieldset>

        {/* Approval — Step 4 (S4-50 .. S4-56) */}
        <fieldset disabled={locked(4)} className={`${sectionCls} min-w-0 ${visible([4]) ? '' : 'hidden'}`} data-testid="approval">
          <h2 className={sectionTitleCls}>Draft B/L &amp; Approval</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div>
              <span className={labelCls}>Draft Version</span>
              <p className="min-h-[42px] border border-ink/20 bg-paper/60 px-3.5 py-2.5 font-mono text-sm text-ink" data-testid="draft-version">{booking.blDraftVersion || '-'}</p>
            </div>
            <div>
              <span className={labelCls}>Draft Sent</span>
              <p className="min-h-[42px] border border-ink/20 bg-paper/60 px-3.5 py-2.5 font-mono text-sm text-ink">{lastDraft ? formatDateTime(lastDraft.sentAt) : '-'}</p>
            </div>
            <Select label="Shipper Approval Status *" options={APPROVAL_OPTIONS} value={form.clientConfirmationStatus} onChange={set('clientConfirmationStatus')} />
          </div>
          {form.clientConfirmationStatus === 'Confirmed' && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Approval Date <span className="text-rust">*</span></label>
                <input type="date" aria-label="Approval date" value={form.approvedAt} onChange={setInput('approvedAt')} className={`${inputCls} border-ink/30 font-mono`} />
              </div>
              <div>
                <label className={labelCls}>Approved By <span className="text-rust">*</span></label>
                <input aria-label="Approved by" value={form.approvedBy} onChange={setInput('approvedBy')} className={`${inputCls} border-ink/30`} />
              </div>
            </div>
          )}
          {form.clientConfirmationStatus === 'Amendments Requested' && (
            <div>
              <label className={labelCls}>Amendment Notes <span className="text-rust">*</span></label>
              <textarea rows={2} aria-label="Amendment notes" value={form.amendmentNotes} onChange={setInput('amendmentNotes')} className={`${inputCls} border-ink/30`} />
            </div>
          )}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div>
              <label className={labelCls}>SI Submitted to VO <span className="text-rust">*</span></label>
              <input type="datetime-local" aria-label="SI submitted to VO" value={form.siSubmittedToVoAt} onChange={setInput('siSubmittedToVoAt')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>VO SI Reference</label>
              <input aria-label="VO SI reference" value={form.voSiReference} onChange={setInput('voSiReference')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>

          {canUpdate && (
            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <button type="button" onClick={act('draft')} disabled={locked(4) || issued || !!busyAction} className={actionBtn}>
                {busy('draft') ? 'Generating…' : 'Generate Draft B/L'}
              </button>
              <button type="button" onClick={act('download-draft')} disabled={!!busyAction} className={actionBtn}>Download draft PDF</button>
              <p className="font-mono text-[11px] text-muted">Sending a draft restarts the approval. Save the exact texts first.</p>
            </div>
          )}
          {(booking.blDrafts || []).length > 0 && (
            <ul className="space-y-0.5 font-mono text-xs text-muted" data-testid="draft-history">
              {booking.blDrafts.map((d) => <li key={d.version}>Draft v{d.version} — sent {formatDateTime(d.sentAt)}{d.note ? ` — ${d.note}` : ''}</li>)}
            </ul>
          )}
        </fieldset>

        {/* HBL / MBL numbers — Step 5 */}
        <fieldset disabled={locked(5)} className={`${sectionCls} min-w-0 ${visible([5]) ? '' : 'hidden'}`}>
          <h2 className={sectionTitleCls}>HBL / MBL Numbers</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls}>HBL Number <span className="normal-case text-muted/70">(auto from the carrier&apos;s series when issued)</span></label>
              <input aria-label="HBL number" value={form.hblNumber} onChange={setInput('hblNumber')} placeholder="Assigned on issue" className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>MBL Number <span className="normal-case text-muted/70">(needed before the pre-alert)</span></label>
              <input aria-label="MBL number" value={form.mblNumber} onChange={setInput('mblNumber')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>
        </fieldset>

        {/* BL Release & sailing — Step 5 */}
        <fieldset disabled={locked(5)} className={`${sectionCls} min-w-0 ${visible([5]) ? '' : 'hidden'}`}>
          <h2 className={sectionTitleCls}>BL Release</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Select label="B/L Release Type *" options={BL_TYPE_OPTIONS} value={form.blType} onChange={set('blType')} />
            <div>
              <label className={labelCls}>Telex Release Sent Date <span className="normal-case text-muted/70">(FM-11-NV)</span></label>
              <input type="date" value={form.telexReleaseSentDate} onChange={setInput('telexReleaseSentDate')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Number of Original B/Ls {form.blType === 'Original 3/3' && <span className="text-rust">*</span>}</label>
              <input type="number" min="0" max="3" value={form.numberOfOriginalBLs} onChange={setInput('numberOfOriginalBLs')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Select label="Freight Terms *" placeholder="Select terms" options={FREIGHT_TERMS_OPTIONS} value={form.freightTermsOnBL} onChange={set('freightTermsOnBL')} />
            <Select label="Freight Payable At *" clearable placeholder="Select" options={PAYABLE_AT_OPTIONS} value={form.freightPayableAt} onChange={set('freightPayableAt')} />
            <Select label="Freight Payment Status" clearable placeholder="Select" options={PAYMENT_STATUS_OPTIONS} value={form.freightPaymentStatus} onChange={set('freightPaymentStatus')} />
          </div>
          {hold && (
            <div className="space-y-2 border border-brick/50 bg-brick/5 p-3" data-testid="release-hold">
              <p className="font-mono text-xs font-bold uppercase tracking-wide text-brick">Release hold — freight is Prepaid and Unpaid</p>
              <label className={labelCls}>Finance override reason <span className="normal-case text-muted/70">(needed to release an Original / Telex B/L)</span></label>
              <input aria-label="Hold override reason" value={form.holdOverrideReason} onChange={setInput('holdOverrideReason')} className={`${inputCls} border-ink/30`} />
            </div>
          )}
          {(booking.quotation?.paymentTerms && form.freightTermsOnBL && form.freightTermsOnBL !== booking.quotation.paymentTerms) || form.freightTermsOverrideReason ? (
            <div>
              <label className={labelCls}>Freight terms override reason <span className="normal-case text-muted/70">(they differ from the quotation&apos;s {booking.quotation?.paymentTerms || 'payment term'})</span></label>
              <input aria-label="Freight terms override reason" value={form.freightTermsOverrideReason} onChange={setInput('freightTermsOverrideReason')} className={`${inputCls} border-ink/30`} />
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Actual Time of Departure (ATD) <span className="text-rust">*</span></label>
              <input type="date" aria-label="ATD" value={form.atd} onChange={setInput('atd')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Shipped On Board Date <span className="text-rust">*</span></label>
              <input type="date" aria-label="Shipped on board" value={form.shippedOnBoardDate} onChange={setInput('shippedOnBoardDate')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Reason (if more than 3 days from ATD)</label>
              <input aria-label="SOB variance reason" value={form.sobVarianceReason} onChange={setInput('sobVarianceReason')} className={`${inputCls} border-ink/30`} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
            <div>
              <label className={labelCls}>Place of Issue <span className="text-rust">*</span></label>
              <input value={form.placeOfIssue} onChange={setInput('placeOfIssue')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Date of Issue <span className="text-rust">*</span></label>
              <input type="date" value={form.dateOfIssue} onChange={setInput('dateOfIssue')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Signatory Name <span className="text-rust">*</span></label>
              <input aria-label="Signatory name" value={form.signatoryName} onChange={setInput('signatoryName')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Signatory Title <span className="text-rust">*</span></label>
              <input aria-label="Signatory title" value={form.signatoryTitle} onChange={setInput('signatoryTitle')} className={`${inputCls} border-ink/30`} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls}>B/L Release Date</label>
              <input type="date" aria-label="B/L release date" value={form.blReleaseDate} onChange={setInput('blReleaseDate')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Courier AWB (originals)</label>
              <input aria-label="Courier AWB" value={form.courierAwb} onChange={setInput('courierAwb')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>
        </fieldset>

        {/* MBL — Step 5 (S5-30 .. S5-35) */}
        <fieldset disabled={locked(5)} className={`${sectionCls} min-w-0 ${visible([5]) ? '' : 'hidden'}`} data-testid="mbl">
          <h2 className={sectionTitleCls}>MBL (issued by the VO)</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div>
              <label className={labelCls}>MBL Shipper</label>
              <input aria-label="MBL shipper" value={form.mblShipper} onChange={setInput('mblShipper')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>MBL Consignee</label>
              <input aria-label="MBL consignee" value={form.mblConsignee} onChange={setInput('mblConsignee')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>MBL Notify</label>
              <input aria-label="MBL notify" value={form.mblNotify} onChange={setInput('mblNotify')} className={`${inputCls} border-ink/30`} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Select label="MBL Release Type" clearable placeholder="Select" options={MBL_RELEASE_OPTIONS} value={form.mblReleaseType} onChange={set('mblReleaseType')} />
            <Select label="MBL Freight Terms" clearable placeholder="Select" options={FREIGHT_TERMS_OPTIONS} value={form.mblFreightTerms} onChange={set('mblFreightTerms')} />
            <div>
              <label className={labelCls}>MBL Issue Date</label>
              <input type="date" aria-label="MBL issue date" value={form.mblIssueDate} onChange={setInput('mblIssueDate')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>
        </fieldset>

        {/* Actions — Step 5 (loading list, DG manifest, HBL, pre-alert) */}
        <div className={`${sectionCls} ${visible([5]) ? '' : 'hidden'}`} data-testid="step5-actions">
          <h2 className={sectionTitleCls}>Documents &amp; Actions</h2>
          {issued && (
            <p className="border border-stamp/50 bg-stamp/5 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wide text-stamp" data-testid="hbl-issued-banner">
              HBL {booking.hblNumber} issued (version {booking.hblVersion}) {formatDateTime(booking.hblIssuedAt)} — the job is locked
            </p>
          )}
          {canUpdate && (
            <div className="space-y-4">
              <p className={subTitleCls}>Before sailing</p>
              <div className="flex flex-wrap items-start gap-3">
                <div>
                  <button type="button" onClick={act('loading-list')} disabled={!states.loadingList?.enabled || !!busyAction} className={actionBtn}>Generate Terminal Loading List</button>
                  {states.loadingList && !states.loadingList.enabled && <p className="mt-1 max-w-xs font-mono text-[10px] text-muted">{states.loadingList.reason}</p>}
                </div>
                <div>
                  <button type="button" onClick={act('dg-manifest')} disabled={!states.dgManifest?.enabled || !!busyAction} className={actionBtn}>Generate DG Manifest</button>
                  {states.dgManifest && !states.dgManifest.enabled && <p className="mt-1 max-w-xs font-mono text-[10px] text-muted">{states.dgManifest.reason}</p>}
                </div>
              </div>
              <p className={subTitleCls}>After sailing</p>
              <div className="flex flex-wrap items-start gap-3">
                {!issued ? (
                  <div>
                    <button type="button" onClick={act('issue')} disabled={!states.issueHbl?.enabled || !!busyAction} className="bg-stamp px-4 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-stamp/90 disabled:cursor-not-allowed disabled:opacity-40">
                      {busy('issue') ? 'Issuing…' : 'Issue HBL'}
                    </button>
                    {states.issueHbl && !states.issueHbl.enabled && <p className="mt-1 max-w-xs font-mono text-[10px] text-muted" data-testid="issue-reason">{states.issueHbl.reason}</p>}
                  </div>
                ) : (
                  <>
                    <button type="button" onClick={act('download-hbl')} disabled={!!busyAction} className={actionBtn}>Download HBL PDF</button>
                    <button type="button" onClick={act('reissue')} disabled={!!busyAction} className="border border-brick/40 px-4 py-2.5 text-sm font-semibold text-brick transition-colors hover:bg-brick/5 disabled:opacity-40">Re-issue HBL</button>
                  </>
                )}
                <div>
                  <button type="button" onClick={act('pre-alert')} disabled={!states.preAlert?.enabled || !!busyAction} className={actionBtn}>
                    {busy('pre-alert') ? 'Sending…' : 'Pre-Alert Destination Agent'}
                  </button>
                  {states.preAlert && !states.preAlert.enabled && <p className="mt-1 max-w-xs font-mono text-[10px] text-muted">{states.preAlert.reason}</p>}
                </div>
                {(booking.preAlerts || []).some((p) => !p.acknowledgedAt) && (
                  <button type="button" onClick={act('pre-alert-ack')} disabled={!!busyAction} className={actionBtn}>Mark pre-alert acknowledged</button>
                )}
              </div>
            </div>
          )}

          {(booking.preAlerts || []).length > 0 && (
            <div data-testid="pre-alert-log">
              <p className={subTitleCls}>Pre-alert log</p>
              <ul className="mt-1 space-y-0.5 font-mono text-xs text-muted">
                {booking.preAlerts.map((p, i) => (
                  <li key={i}>{formatDateTime(p.sentAt)} → {(p.recipients || []).join(', ')} — {p.acknowledgedAt ? `acknowledged ${formatDateTime(p.acknowledgedAt)}` : 'awaiting acknowledgement'}</li>
                ))}
              </ul>
            </div>
          )}
          {(booking.documents || []).length > 0 && (
            <div data-testid="document-history">
              <p className={subTitleCls}>Generated documents</p>
              <ul className="mt-1 space-y-0.5 font-mono text-xs text-muted">
                {booking.documents.slice().reverse().map((d, i) => <li key={i}>{docKinds[d.kind] || d.kind} v{d.version} — {formatDateTime(d.at)}</li>)}
              </ul>
            </div>
          )}
          {(booking.hblHistory || []).length > 0 && (
            <div>
              <p className={subTitleCls}>HBL history</p>
              <ul className="mt-1 space-y-0.5 font-mono text-xs text-muted">
                {booking.hblHistory.map((h, i) => <li key={i}>{h.number} v{h.version} — issued {formatDateTime(h.issuedAt)}{h.replacedAt ? ` — replaced ${formatDateTime(h.replacedAt)} (${h.reason})` : ''}</li>)}
              </ul>
            </div>
          )}
        </div>

        {/* Sea/Customs Closure — Step 5 */}
        <div className={`${sectionCls} ${visible([5]) ? '' : 'hidden'}`}>
          <h2 className={sectionTitleCls}>Sea/Customs Closure</h2>
          {!closureUnlocked ? (
            <p className="font-mono text-xs text-signal">
              This checklist unlocks once the Actual Time of Departure (ATD) is set and saved in the BL Release block above.
            </p>
          ) : (
            <p className="font-mono text-xs text-muted">Actual departure recorded — checklist is unlocked.</p>
          )}
          <fieldset disabled={!closureUnlocked} className="space-y-5 disabled:opacity-50">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Select label="Final Load List Status" options={SENT_STATUS_OPTIONS} value={form.finalLoadListStatus} onChange={set('finalLoadListStatus')} />
              <div>
                <label className="mb-1.5 mt-6 flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={form.dgManifestRequired} onChange={setChecked('dgManifestRequired')} className="h-4 w-4" />
                  DG Manifest Required
                </label>
              </div>
              <Select label="DG Manifest Status" options={MANIFEST_STATUS_OPTIONS} value={form.dgManifestStatus} onChange={set('dgManifestStatus')} />
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1.5 mt-6 flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={form.reeferManifestRequired} onChange={setChecked('reeferManifestRequired')} className="h-4 w-4" />
                  Reefer Manifest Required
                </label>
              </div>
              <Select label="Reefer Manifest Status" options={MANIFEST_STATUS_OPTIONS} value={form.reeferManifestStatus} onChange={set('reeferManifestStatus')} />
              <Select label="Invoice Status" options={INVOICE_STATUS_OPTIONS} value={form.invoiceStatus} onChange={set('invoiceStatus')} />
            </div>
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={form.paymentRequestSent} onChange={setChecked('paymentRequestSent')} className="h-4 w-4" />
                Payment Request Sent to Accounting
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={form.preAlertSent} onChange={setChecked('preAlertSent')} className="h-4 w-4" />
                Pre-Alert Sent to Destination Agent (BL &amp; TDR)
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={form.subManifestNafezaSubmitted} onChange={setChecked('subManifestNafezaSubmitted')} className="h-4 w-4" />
                Sub-Manifest Submitted on Nafeza
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={form.subManifestIssuedSent} onChange={setChecked('subManifestIssuedSent')} className="h-4 w-4" />
                Sub-Manifest Issued &amp; Sent (FM-08-NV)
              </label>
            </div>
          </fieldset>
        </div>

        {/* Final Follow-up & Closing — Step 5 */}
        <div className={`${sectionCls} ${visible([5]) ? '' : 'hidden'}`}>
          <h2 className={sectionTitleCls}>Final Follow-up &amp; Closing</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div>
              <span className={labelCls}>ETD</span>
              <p className="font-mono text-sm text-ink">{formatDateTime(booking.etd)}</p>
            </div>
            <div>
              <span className={labelCls}>ETA vs ATA</span>
              <p className="font-mono text-sm text-ink">{formatDateTime(booking.eta)} → {formatDateTime(booking.ata)}</p>
            </div>
            <div>
              <label className={labelCls}>Customer Notified Date</label>
              <input type="date" value={form.customerNotifiedDate} onChange={setInput('customerNotifiedDate')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>
          <p className="font-mono text-xs text-muted">
            Job closing is tracked via Job Status in Step 2 (Booking), above (Completed / Closed - Invoiced) — not a separate field here.
          </p>

          <div>
            <label className={labelCls}>POD Agent Update Log</label>
            <div className="space-y-2">
              {form.podAgentUpdateLog.map((entry, i) => (
                <div key={entry._id || i} className="flex items-center gap-2 border border-ink/20 bg-paper/60 px-3 py-2 text-sm">
                  <span className="font-mono text-xs text-ink">{entry.date}</span>
                  <span className="flex-1 text-ink">{entry.note}</span>
                  <button type="button" onClick={() => removeLogEntry(i)} className="shrink-0 px-1 text-muted transition-colors hover:text-brick">✕</button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input type="date" value={newLogDate} onChange={(e) => setNewLogDate(e.target.value)} className={`${inputCls} w-44 border-ink/30 font-mono`} />
                <input value={newLogNote} onChange={(e) => setNewLogNote(e.target.value)} placeholder="Update note" className={`${inputCls} border-ink/30`} />
                <button type="button" onClick={addLogEntry} className="shrink-0 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-rust transition-colors hover:text-rust-dark">
                  + Add
                </button>
              </div>
            </div>
          </div>
        </div>
      </fieldset>

      {canUpdate && (
        <div className="flex justify-end border-t border-line pt-5">
          <button type="submit" disabled={submitting} className="bg-rust px-6 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-rust-dark disabled:opacity-50">
            {submitting ? 'Saving…' : 'Save B&L details'}
          </button>
        </div>
      )}
    </form>
  )
}
