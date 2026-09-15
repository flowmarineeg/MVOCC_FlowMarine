'use client'

import { useState } from 'react'
import Select from '@/components/ui/Select'

const toDateInput = (d) => {
  if (!d) return ''
  return (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10)
}

const formatDateTime = (d) => (d ? new Date(d).toLocaleString() : '-')

const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

const CLIENT_CONFIRMATION_OPTIONS = ['Pending', 'Confirmed'].map((v) => ({ value: v, label: v }))
const BL_TYPE_OPTIONS = ['Original 3/3', 'Seaway Bill', 'Express Release', 'Telex Release'].map((v) => ({ value: v, label: v }))
const FREIGHT_TERMS_OPTIONS = ['Freight Prepaid', 'Freight Collect'].map((v) => ({ value: v, label: v }))
const SENT_STATUS_OPTIONS = ['Pending', 'Sent'].map((v) => ({ value: v, label: v }))
const MANIFEST_STATUS_OPTIONS = ['N/A', 'Pending', 'Sent'].map((v) => ({ value: v, label: v }))
const INVOICE_STATUS_OPTIONS = ['Draft', 'Issued', 'Paid'].map((v) => ({ value: v, label: v }))

function buildInitialForm(booking) {
  return {
    elHarkaRepName: booking.elHarkaRepName || '',
    exportCustomsDeclarationNo: booking.exportCustomsDeclarationNo || '',
    certificateReceivedDate: toDateInput(booking.certificateReceivedDate),
    customsCertificateFile: null,

    hblNumber: booking.hblNumber || '',
    mblNumber: booking.mblNumber || '',
    notifyPartyName: booking.notifyPartyName || '',
    notifyPartyAddress: booking.notifyPartyAddress || '',
    destinationAgentDetails: booking.destinationAgentDetails || '',
    consigneeToOrder: !!booking.consigneeToOrder,
    blDraftVersion: booking.blDraftVersion || '',
    draftSentToClientDate: toDateInput(booking.draftSentToClientDate),
    clientConfirmationStatus: booking.clientConfirmationStatus || 'Pending',

    blType: booking.blType || 'Telex Release',
    telexReleaseSentDate: toDateInput(booking.telexReleaseSentDate),
    numberOfOriginalBLs: booking.numberOfOriginalBLs ?? '',
    freightTermsOnBL: booking.freightTermsOnBL || '',
    placeOfIssue: booking.placeOfIssue || '',
    dateOfIssue: toDateInput(booking.dateOfIssue),

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
    customerNotifiedDate: toDateInput(booking.customerNotifiedDate),
  }
}

const labelCls = 'mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted'
const inputCls = 'w-full border bg-card px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust'
const sectionCls = 'space-y-5 border border-ink/25 bg-card p-5 sm:p-6'
const sectionTitleCls = 'font-display text-base font-bold uppercase tracking-wide text-ink'

export default function BLForm({ booking, canUpdate = true, submitting = false, onSubmit }) {
  const [form, setForm] = useState(() => buildInitialForm(booking))
  const [newLogDate, setNewLogDate] = useState('')
  const [newLogNote, setNewLogNote] = useState('')
  const [errors, setErrors] = useState({})

  const set = (field) => (v) => setForm((f) => ({ ...f, [field]: v }))
  const setInput = (field) => (e) => set(field)(e.target.value)
  const setChecked = (field) => (e) => set(field)(e.target.checked)

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
    ;['elHarkaRepName', 'exportCustomsDeclarationNo', 'hblNumber', 'mblNumber', 'notifyPartyName', 'notifyPartyAddress', 'destinationAgentDetails', 'blDraftVersion', 'placeOfIssue'].forEach((k) => {
      if (form[k].trim()) fd.append(k, form[k].trim())
    })
    ;['certificateReceivedDate', 'draftSentToClientDate', 'telexReleaseSentDate', 'dateOfIssue', 'customerNotifiedDate'].forEach((k) => {
      if (form[k]) fd.append(k, form[k])
    })
    if (form.numberOfOriginalBLs !== '') fd.append('numberOfOriginalBLs', form.numberOfOriginalBLs)
    if (form.freightTermsOnBL) fd.append('freightTermsOnBL', form.freightTermsOnBL)
    fd.append('consigneeToOrder', String(form.consigneeToOrder))
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

    onSubmit(fd)
  }

  const consigneeDisplay = form.consigneeToOrder ? 'To Order' : [booking.consignee?.name, booking.consignee?.address].filter(Boolean).join(' — ') || '-'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset disabled={!canUpdate} className="space-y-6">
        {/* Context recap — read-only, pulled from the booking */}
        <div className={sectionCls}>
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

        {/* Customs Certificate */}
        <div className={sectionCls}>
          <h2 className={sectionTitleCls}>Customs Certificate</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={labelCls}>El-Harka Representative Name</label>
              <input value={form.elHarkaRepName} onChange={setInput('elHarkaRepName')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Export Customs Declaration No</label>
              <input value={form.exportCustomsDeclarationNo} onChange={setInput('exportCustomsDeclarationNo')} className={`${inputCls} border-ink/30 font-mono`} />
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
        </div>

        {/* BL Parties & Draft BL */}
        <div className={sectionCls}>
          <h2 className={sectionTitleCls}>BL Parties &amp; Draft BL</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls}>HBL Number</label>
              <input value={form.hblNumber} onChange={setInput('hblNumber')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>MBL Number</label>
              <input value={form.mblNumber} onChange={setInput('mblNumber')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={form.consigneeToOrder} onChange={setChecked('consigneeToOrder')} className="h-4 w-4" />
              Consignee is &quot;To Order&quot; <span className="normal-case text-muted/70">(instead of the named consignee above)</span>
            </label>
          </div>

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

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div>
              <label className={labelCls}>BL Draft Version</label>
              <input value={form.blDraftVersion} onChange={setInput('blDraftVersion')} placeholder="v1" className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Draft Sent to Client Date</label>
              <input type="date" value={form.draftSentToClientDate} onChange={setInput('draftSentToClientDate')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <Select label="Client Confirmation Status" options={CLIENT_CONFIRMATION_OPTIONS} value={form.clientConfirmationStatus} onChange={set('clientConfirmationStatus')} />
          </div>
        </div>

        {/* BL Release */}
        <div className={sectionCls}>
          <h2 className={sectionTitleCls}>BL Release</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Select label="B/L Type" options={BL_TYPE_OPTIONS} value={form.blType} onChange={set('blType')} />
            <div>
              <label className={labelCls}>Telex Release Sent Date <span className="normal-case text-muted/70">(FM-11-NV)</span></label>
              <input type="date" value={form.telexReleaseSentDate} onChange={setInput('telexReleaseSentDate')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Number of Original B/Ls</label>
              <input type="number" min="0" value={form.numberOfOriginalBLs} onChange={setInput('numberOfOriginalBLs')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Select label="Freight Terms on BL" placeholder="Select terms" options={FREIGHT_TERMS_OPTIONS} value={form.freightTermsOnBL} onChange={set('freightTermsOnBL')} />
            <div>
              <label className={labelCls}>Place of Issue</label>
              <input value={form.placeOfIssue} onChange={setInput('placeOfIssue')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Date of Issue</label>
              <input type="date" value={form.dateOfIssue} onChange={setInput('dateOfIssue')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>
        </div>

        {/* Sea/Customs Closure */}
        <div className={sectionCls}>
          <h2 className={sectionTitleCls}>Sea/Customs Closure</h2>
          {!closureUnlocked ? (
            <p className="font-mono text-xs text-signal">
              This checklist unlocks once the Actual Time of Departure (ATD) is set on the Booking & Job edit page.
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

        {/* Final Follow-up & Closing */}
        <div className={sectionCls}>
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
            Job closing is tracked via Job Status on the Booking & Job edit page (Completed / Closed - Invoiced) — not a separate field here.
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
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
    </form>
  )
}
