'use client'

import { useEffect, useState } from 'react'
import Select from '@/components/ui/Select'
import ContainerSelector from './ContainerSelector'
import * as stockApi from '@/services/stock'
import { COUNTRY_OPTIONS } from '@/constants/countries'
import { CURRENCY_OPTIONS } from '@/constants/currencies'

// `d` is either a Date instance or an ISO date string from the API —
// String(Date) is NOT yyyy-mm-dd, so a plain Date must go through
// toISOString() first or <input type="date"> silently renders empty.
const toDateInput = (d) => {
  if (!d) return ''
  return (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10)
}

// Cut-off fields carry a time component (SI/VGM/CY gate-in cut-off), so they
// use <input type="datetime-local"> — built from local time components, not
// toISOString() (which is UTC and would shift the displayed time).
const toDateTimeInput = (d) => {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const formatDateTime = (d) => (d ? new Date(d).toLocaleString() : '-')

const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

const emptyParty = { name: '', email: '', phone1: '', phone2: '', address: '', taxNumber: '' }
const emptyAgent = { name: '', email: '', phone: '', address: '' }

const JOB_STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'closed_invoiced', label: 'Closed - Invoiced' },
]
const SPACE_CONFIRMATION_OPTIONS = ['Requested', 'Confirmed', 'Rejected'].map((v) => ({ value: v, label: v }))
const BOOKING_CONFIRMATION_OPTIONS = ['Not Issued', 'Issued'].map((v) => ({ value: v, label: v }))
const MANIFEST_OPTIONS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'CONFIRMED', label: 'Confirmed' },
]
const GUARANTEE_OPTIONS = ['Received', 'Pending'].map((v) => ({ value: v, label: v }))
const CONTAINER_STATUS_OPTIONS = ['Empty Assigned', 'Gated-In', 'Loaded', 'Departed'].map((v) => ({ value: v, label: v }))
const VAS_OPTIONS = ['Not Uploaded', 'Uploaded'].map((v) => ({ value: v, label: v }))

// The backend rejects the same containerType appearing twice in one booking
// (one row per type is the persisted invariant) — the UI still lets someone
// add two rows of the same type to build up a quantity, so collapse those
// into a single summed row right before submit.
function mergeContainerRows(containers) {
  const merged = []
  const indexByType = new Map()
  containers
    .filter((c) => c.containerType && c.quantity >= 1)
    .forEach((c) => {
      const existingIndex = indexByType.get(c.containerType)
      if (existingIndex === undefined) {
        indexByType.set(c.containerType, merged.length)
        merged.push({ containerType: c.containerType, quantity: Number(c.quantity) })
      } else {
        merged[existingIndex].quantity += Number(c.quantity)
      }
    })
  return merged
}

function emptyForm() {
  return {
    clientName: '', clientPhone: '', clientEmail: '',
    pol: '', pod: '', commodity: '',
    ucrNumber: '', exportTaxNumber: '', importTaxNumber: '', importCountry: '', packagesCount: '',
    vgm: '', grossWeight: '', cbm: '', hsCode: '', packageType: '',
    isDangerous: false, dangerousNumber: '',
    shippingDeclaration: null,
    containers: [{ containerType: '', quantity: 1 }],
    jobStatus: 'open',
    blNo: '', carrier: '', vesselName: '', voyageNo: '', etd: '', atd: '', eta: '', ata: '',
    spaceConfirmationStatus: 'Requested', carrierBookingRef: '', voContactPerson: '',
    siCutoff: '', vgmCutoff: '', cyGateInCutoff: '',
    bookingConfirmationStatus: 'Not Issued', bookingConfirmationFile: null,
    customsSubmitted: false, customsReferenceNo: '',
    depot: '', gateInDate: '', gateOutDate: '', containerLocation: '',
    nvocc: '', currency: 'USD', price: '', cost: '', freeTime: '',
    shipper: { ...emptyParty }, consignee: { ...emptyParty },
    polAgent: { ...emptyAgent }, podAgent: { ...emptyAgent },
    manifestStatus: 'PENDING', notes: '',
  }
}

function buildInitialForm(booking, prefill) {
  if (!booking) return { ...emptyForm(), ...prefill }
  return {
    clientName: booking.clientName || '',
    clientPhone: booking.clientPhone || '',
    clientEmail: booking.clientEmail || '',
    pol: booking.pol?._id || booking.pol || '',
    pod: booking.pod?._id || booking.pod || '',
    commodity: booking.commodity || '',
    ucrNumber: booking.ucrNumber || '',
    exportTaxNumber: booking.exportTaxNumber || '',
    importTaxNumber: booking.importTaxNumber || '',
    importCountry: booking.importCountry || '',
    packagesCount: booking.packagesCount ?? '',
    vgm: booking.vgm ?? '',
    grossWeight: booking.grossWeight ?? '',
    cbm: booking.cbm ?? '',
    hsCode: booking.hsCode || '',
    packageType: booking.packageType || '',
    isDangerous: !!booking.isDangerous,
    dangerousNumber: booking.dangerousNumber || '',
    shippingDeclaration: null,
    containers: (booking.containers || []).map((c) => ({
      containerType: c.containerType?._id || c.containerType,
      quantity: c.quantity,
    })),
    jobStatus: booking.jobStatus || 'open',
    blNo: booking.blNo || '',
    carrier: booking.carrier?._id || booking.carrier || '',
    vesselName: booking.vesselName || '',
    voyageNo: booking.voyageNo || '',
    etd: toDateInput(booking.etd),
    atd: toDateInput(booking.atd),
    eta: toDateInput(booking.eta),
    ata: toDateInput(booking.ata),
    spaceConfirmationStatus: booking.spaceConfirmationStatus || 'Requested',
    carrierBookingRef: booking.carrierBookingRef || '',
    voContactPerson: booking.voContactPerson || '',
    siCutoff: toDateTimeInput(booking.siCutoff),
    vgmCutoff: toDateTimeInput(booking.vgmCutoff),
    cyGateInCutoff: toDateTimeInput(booking.cyGateInCutoff),
    bookingConfirmationStatus: booking.bookingConfirmationStatus || 'Not Issued',
    bookingConfirmationFile: null,
    customsSubmitted: !!booking.customsSubmitted,
    customsReferenceNo: booking.customsReferenceNo || '',
    depot: booking.depot?._id || booking.depot || '',
    gateInDate: toDateInput(booking.gateInDate),
    gateOutDate: toDateInput(booking.gateOutDate),
    containerLocation: booking.containerLocation || '',
    nvocc: booking.nvocc?._id || booking.nvocc || '',
    currency: booking.currency || 'USD',
    price: booking.price ?? '',
    cost: booking.cost ?? '',
    freeTime: toDateInput(booking.freeTime),
    shipper: { ...emptyParty, ...(booking.shipper || {}) },
    consignee: { ...emptyParty, ...(booking.consignee || {}) },
    polAgent: { ...emptyAgent, ...(booking.polAgent || {}) },
    podAgent: { ...emptyAgent, ...(booking.podAgent || {}) },
    manifestStatus: booking.manifestStatus || 'PENDING',
    notes: booking.notes || '',
  }
}

const labelCls = 'mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted'
const inputCls = 'w-full border bg-card px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust'
const sectionCls = 'space-y-5 border border-ink/25 bg-card p-5 sm:p-6'
const sectionTitleCls = 'font-display text-base font-bold uppercase tracking-wide text-ink'

// Per-unit operational fields for the containers actually allocated to a
// confirmed booking (Section 5's fulfillment table) — separate from the
// request/summary quantities in ContainerSelector above it.
function AllocatedContainersPanel({ bookingId, canUpdate }) {
  const [containers, setContainers] = useState([])
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState({})
  const [savingId, setSavingId] = useState(null)

  const load = () => {
    stockApi.getContainers({ booking: bookingId })
      .then((rows) => {
        setContainers(rows)
        setDrafts(Object.fromEntries(rows.map((c) => [c._id, {
          sealNumber: c.sealNumber || '',
          guaranteeReceiptStatus: c.guaranteeReceiptStatus || '',
          containerStatus: c.containerStatus || '',
          gateInDate: toDateInput(c.gateInDate),
          vasUploadStatus: c.vasUploadStatus || '',
        }])))
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId])

  const setDraft = (id, field) => (v) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [field]: v } }))

  const handleSave = async (id) => {
    setSavingId(id)
    try {
      const draft = drafts[id]
      await stockApi.updateContainerUnit(id, {
        sealNumber: draft.sealNumber || undefined,
        guaranteeReceiptStatus: draft.guaranteeReceiptStatus || undefined,
        containerStatus: draft.containerStatus || undefined,
        gateInDate: draft.gateInDate || undefined,
        vasUploadStatus: draft.vasUploadStatus || undefined,
      })
      load()
    } finally {
      setSavingId(null)
    }
  }

  if (loading) return <p className="text-sm text-muted">Loading allocated containers…</p>
  if (containers.length === 0) return <p className="text-sm text-muted">No containers allocated yet.</p>

  return (
    <div className="overflow-x-auto border border-ink/25">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-ink text-left font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            <th className="px-3 py-2">Container No.</th>
            <th className="px-3 py-2">Seal Number</th>
            <th className="px-3 py-2">Guarantee Receipt</th>
            <th className="px-3 py-2">Container Status</th>
            <th className="px-3 py-2">Gate-In Date</th>
            <th className="px-3 py-2">VAS Upload</th>
            {canUpdate && <th className="px-3 py-2 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {containers.map((c) => {
            const d = drafts[c._id] || {}
            return (
              <tr key={c._id} className="border-b border-line last:border-0">
                <td className="px-3 py-2 font-mono text-ink">{c.containerNumber}</td>
                <td className="px-3 py-2">
                  <input value={d.sealNumber} onChange={(e) => setDraft(c._id, 'sealNumber')(e.target.value)} disabled={!canUpdate} className={`${inputCls} border-ink/30 font-mono`} />
                </td>
                <td className="px-3 py-2">
                  <Select options={GUARANTEE_OPTIONS} value={d.guaranteeReceiptStatus} onChange={setDraft(c._id, 'guaranteeReceiptStatus')} placeholder="—" disabled={!canUpdate} />
                </td>
                <td className="px-3 py-2">
                  <Select options={CONTAINER_STATUS_OPTIONS} value={d.containerStatus} onChange={setDraft(c._id, 'containerStatus')} placeholder="—" disabled={!canUpdate} />
                </td>
                <td className="px-3 py-2">
                  <input type="date" value={d.gateInDate} onChange={(e) => setDraft(c._id, 'gateInDate')(e.target.value)} disabled={!canUpdate} className={`${inputCls} border-ink/30 font-mono`} />
                </td>
                <td className="px-3 py-2">
                  <Select options={VAS_OPTIONS} value={d.vasUploadStatus} onChange={setDraft(c._id, 'vasUploadStatus')} placeholder="—" disabled={!canUpdate} />
                </td>
                {canUpdate && (
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleSave(c._id)}
                      disabled={savingId === c._id}
                      className="font-mono text-[10px] font-semibold uppercase tracking-wide text-rust transition-colors hover:text-rust-dark disabled:opacity-50"
                    >
                      {savingId === c._id ? 'Saving…' : 'Save'}
                    </button>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Which of the 5 merged-page steps each section belongs to — see
// docs/BOOKING_JOB_MERGE_DATA_REPORT.md. `activeStep` is undefined on the
// plain create page (/export/bookings/new), where every section is always
// shown, unchanged from before this merge; on the unified details page it's
// 1-5 and only the matching section(s) are visible (CSS-hidden, not
// unmounted, so nothing in `form` state is ever lost by switching steps).
const STEP = {
  jobIdentity: 2, // Job No/Status, Client — Header & Job Info, part A
  declarationIdentity: 1, // UCR/tax numbers/import country/packages — Header & Job Info, part B
  shipmentCargo: 1,
  parties: 1,
  carrierBooking: 2,
  commercial: 2,
  agents: 2,
  customsNafeza: 4,
  containers: 3,
  statusNotes: 5,
}

export default function BookingForm({
  booking = null,
  prefill = null,
  quotationId = null,
  activeStep,
  ports = [],
  containerTypes = [],
  carriers = [],
  nvoccs = [],
  depots = [],
  stockMap = {},
  submitting = false,
  canUpdate = true,
  onSubmit,
  onInvalidStep,
}) {
  const isEdit = !!booking
  const isCancelled = isEdit && booking.status === 'cancelled'
  const isLocked = isCancelled || !canUpdate
  const [form, setForm] = useState(() => buildInitialForm(booking, prefill))
  const [errors, setErrors] = useState({})

  const set = (field) => (v) => setForm((f) => ({ ...f, [field]: v }))
  const setInput = (field) => (e) => set(field)(e.target.value)
  const setNested = (section, key) => (e) => setForm((f) => ({ ...f, [section]: { ...f[section], [key]: e.target.value } }))

  // undefined activeStep (the create page) -> every section always shown.
  const visible = (step) => activeStep === undefined || activeStep === step

  const portOptions = ports.map((p) => ({ value: p._id, label: `${p.code} — ${p.name}` }))
  const carrierOptions = carriers.map((c) => ({ value: c._id, label: `${c.code} — ${c.name}` }))
  const nvoccOptions = nvoccs.map((n) => ({ value: n._id, label: `${n.code} — ${n.name}` }))
  const depotOptions = depots.map((d) => ({ value: d._id, label: `${d.code} — ${d.name}` }))

  const handleFileChange = (field) => (e) => {
    const file = e.target.files?.[0] || null
    if (file && !ALLOWED_FILE_TYPES.includes(file.type)) {
      setErrors((prev) => ({ ...prev, [field]: 'Only PDF or image files (JPG, PNG, WEBP) are allowed' }))
      e.target.value = ''
      return
    }
    setErrors((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
    set(field)(file)
  }

  const validate = () => {
    const next = {}
    if (!form.clientName.trim()) next.clientName = 'Client name is required'
    if (!form.clientPhone.trim()) next.clientPhone = 'Client phone is required'
    if (!/^\S+@\S+\.\S+$/.test(form.clientEmail)) next.clientEmail = 'Enter a valid client email'
    if (!form.pol) next.pol = 'Port of loading is required'
    if (!form.pod) next.pod = 'Port of discharge is required'
    if (!form.commodity.trim()) next.commodity = 'Commodity is required'
    if (form.isDangerous && !form.dangerousNumber.trim()) next.dangerousNumber = 'Dangerous goods number is required'
    const validContainers = form.containers.filter((c) => c.containerType && c.quantity >= 1)
    if (validContainers.length === 0) next.containers = 'Add at least one container entry'
    setErrors((prev) => ({ ...prev, ...next }))
    // Jump to the earliest step holding an error, so a failed submit from a
    // different step doesn't look like a silent no-op.
    if (onInvalidStep) {
      const fieldStep = { pol: 1, pod: 1, commodity: 1, dangerousNumber: 1, clientName: 2, clientPhone: 2, clientEmail: 2, containers: 3 }
      const steps = Object.keys(next).map((k) => fieldStep[k]).filter(Boolean)
      if (steps.length) onInvalidStep(Math.min(...steps))
    }
    return Object.keys(next).length === 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!validate()) return

    const fd = new FormData()
    fd.append('clientName', form.clientName.trim())
    fd.append('clientPhone', form.clientPhone.trim())
    fd.append('clientEmail', form.clientEmail.trim())
    fd.append('pol', form.pol)
    fd.append('pod', form.pod)
    fd.append('commodity', form.commodity.trim())
    ;['ucrNumber', 'exportTaxNumber', 'importTaxNumber', 'importCountry', 'hsCode', 'packageType', 'blNo', 'vesselName', 'voyageNo', 'carrierBookingRef', 'voContactPerson', 'customsReferenceNo', 'containerLocation', 'notes'].forEach((k) => {
      if (form[k].trim()) fd.append(k, form[k].trim())
    })
    ;['packagesCount', 'vgm', 'grossWeight', 'cbm', 'price', 'cost'].forEach((k) => {
      if (form[k] !== '') fd.append(k, form[k])
    })
    ;['etd', 'atd', 'eta', 'ata', 'siCutoff', 'vgmCutoff', 'cyGateInCutoff', 'gateInDate', 'gateOutDate', 'freeTime'].forEach((k) => {
      if (form[k]) fd.append(k, form[k])
    })
    fd.append('isDangerous', String(form.isDangerous))
    if (form.isDangerous) fd.append('dangerousNumber', form.dangerousNumber.trim())
    fd.append('jobStatus', form.jobStatus)
    fd.append('spaceConfirmationStatus', form.spaceConfirmationStatus)
    fd.append('bookingConfirmationStatus', form.bookingConfirmationStatus)
    fd.append('customsSubmitted', String(form.customsSubmitted))
    fd.append('manifestStatus', form.manifestStatus)
    if (form.carrier) fd.append('carrier', form.carrier)
    if (form.depot) fd.append('depot', form.depot)
    if (form.nvocc) fd.append('nvocc', form.nvocc)
    fd.append('currency', form.currency)
    fd.append('shipper', JSON.stringify(form.shipper))
    fd.append('consignee', JSON.stringify(form.consignee))
    fd.append('polAgent', JSON.stringify(form.polAgent))
    fd.append('podAgent', JSON.stringify(form.podAgent))
    fd.append('containers', JSON.stringify(mergeContainerRows(form.containers)))
    if (form.shippingDeclaration) fd.append('shippingDeclaration', form.shippingDeclaration)
    if (form.bookingConfirmationFile) fd.append('bookingConfirmationFile', form.bookingConfirmationFile)
    if (quotationId) fd.append('quotation', quotationId)

    onSubmit(fd)
  }

  const consigneePreview = [form.consignee.name, form.consignee.phone1, form.consignee.email].filter(Boolean).join(' · ')

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset disabled={isLocked} className="space-y-6">
        {/* Header & Job Info — part A: job/client identity (Step 2 — Booking) */}
        <div className={`${sectionCls} ${visible(STEP.jobIdentity) ? '' : 'hidden'}`}>
          <h2 className={sectionTitleCls}>Header &amp; Job Info</h2>

          {isEdit && (
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 border border-ink/20 bg-paper/60 p-4 text-sm sm:grid-cols-3">
              <div>
                <span className={labelCls}>Job No</span>
                <p className="font-mono text-ink">{booking.jobNo}</p>
              </div>
              <div>
                <span className={labelCls}>Quotation Ref</span>
                <p className="font-mono text-ink">{booking.quotation?.quotationNo || '-'}</p>
              </div>
              <div>
                <span className={labelCls}>Job Opened By / Date</span>
                <p className="text-ink">{booking.jobOpenedBy?.name || '-'} · {formatDateTime(booking.createdAt)}</p>
              </div>
            </div>
          )}
          {!isEdit && (
            <p className="font-mono text-xs text-muted">Job No is auto-generated on save.</p>
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Select label="Job Status" options={JOB_STATUS_OPTIONS} value={form.jobStatus} onChange={set('jobStatus')} />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Client Name <span className="text-rust">*</span></label>
              <input value={form.clientName} onChange={setInput('clientName')} className={`${inputCls} ${errors.clientName ? 'border-brick' : 'border-ink/30'}`} />
              {errors.clientName && <p className="mt-1 font-mono text-xs text-brick">{errors.clientName}</p>}
            </div>
            <div>
              <label className={labelCls}>Client Phone <span className="text-rust">*</span></label>
              <input value={form.clientPhone} onChange={setInput('clientPhone')} className={`${inputCls} ${errors.clientPhone ? 'border-brick' : 'border-ink/30'}`} />
              {errors.clientPhone && <p className="mt-1 font-mono text-xs text-brick">{errors.clientPhone}</p>}
            </div>
            <div>
              <label className={labelCls}>Client Email <span className="text-rust">*</span></label>
              <input type="email" value={form.clientEmail} onChange={setInput('clientEmail')} className={`${inputCls} ${errors.clientEmail ? 'border-brick' : 'border-ink/30'}`} />
              {errors.clientEmail && <p className="mt-1 font-mono text-xs text-brick">{errors.clientEmail}</p>}
            </div>
          </div>
        </div>

        {/* Shipment & Cargo + Header & Job Info part B (declaration-identity fields) — Step 1 */}
        <div className={`${sectionCls} ${visible(STEP.shipmentCargo) ? '' : 'hidden'}`}>
          <h2 className={sectionTitleCls}>Shipment &amp; Cargo</h2>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Select label="Port of Loading (POL)" required searchable placeholder="Select POL" options={portOptions} value={form.pol} onChange={set('pol')} error={errors.pol} />
            <Select label="Port of Discharge (POD)" required searchable placeholder="Select POD" options={portOptions} value={form.pod} onChange={set('pod')} error={errors.pod} />
          </div>

          <div>
            <label className={labelCls}>Commodity <span className="text-rust">*</span></label>
            <input value={form.commodity} onChange={setInput('commodity')} className={`${inputCls} ${errors.commodity ? 'border-brick' : 'border-ink/30'}`} placeholder="e.g. Frozen poultry" />
            {errors.commodity && <p className="mt-1 font-mono text-xs text-brick">{errors.commodity}</p>}
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className={labelCls}>UCR Number</label>
              <input value={form.ucrNumber} onChange={setInput('ucrNumber')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Exporter Tax Number</label>
              <input value={form.exportTaxNumber} onChange={setInput('exportTaxNumber')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Importer Tax Number</label>
              <input value={form.importTaxNumber} onChange={setInput('importTaxNumber')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <Select label="Importer Country" searchable placeholder="Select country" options={COUNTRY_OPTIONS} value={form.importCountry} onChange={set('importCountry')} />
            <div>
              <label className={labelCls}>No. of Packages <span className="normal-case text-muted/70">(preliminary)</span></label>
              <input type="number" min="0" value={form.packagesCount} onChange={setInput('packagesCount')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelCls}>VGM (kg)</label>
              <input type="number" min="0" value={form.vgm} onChange={setInput('vgm')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Gross Weight (kg)</label>
              <input type="number" min="0" value={form.grossWeight} onChange={setInput('grossWeight')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>CBM</label>
              <input type="number" min="0" value={form.cbm} onChange={setInput('cbm')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>HS Code</label>
              <input value={form.hsCode} onChange={setInput('hsCode')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Package Type</label>
            <input value={form.packageType} onChange={setInput('packageType')} className={`${inputCls} border-ink/30 sm:w-64`} placeholder="e.g. Cartons, Pallets" />
          </div>

          <div>
            <label className={labelCls}>Dangerous Goods</label>
            <div className="flex border border-ink/30">
              <button type="button" onClick={() => set('isDangerous')(false)} className={`flex-1 py-2.5 text-sm font-semibold uppercase tracking-wide transition-colors ${!form.isDangerous ? 'bg-ink text-paper' : 'bg-card text-muted hover:text-ink'}`}>No</button>
              <button type="button" onClick={() => set('isDangerous')(true)} className={`flex-1 border-l border-ink/30 py-2.5 text-sm font-semibold uppercase tracking-wide transition-colors ${form.isDangerous ? 'bg-brick text-card' : 'bg-card text-muted hover:text-ink'}`}>Yes</button>
            </div>
          </div>
          {form.isDangerous && (
            <div>
              <label className={labelCls}>Dangerous Goods Number <span className="text-rust">*</span></label>
              <input value={form.dangerousNumber} onChange={setInput('dangerousNumber')} className={`${inputCls} font-mono sm:w-80 ${errors.dangerousNumber ? 'border-brick' : 'border-ink/30'}`} placeholder="UN Number / IMO Class" />
              {errors.dangerousNumber && <p className="mt-1 font-mono text-xs text-brick">{errors.dangerousNumber}</p>}
            </div>
          )}

          <div>
            <label className={labelCls}>Shipping Declaration <span className="normal-case text-muted/70">(optional, PDF or image)</span></label>
            <label className={`flex cursor-pointer items-center justify-between border bg-card px-3.5 py-2.5 text-sm text-muted transition-colors hover:border-ink/55 ${errors.shippingDeclaration ? 'border-brick' : 'border-ink/30'}`}>
              <span className="truncate">
                {form.shippingDeclaration ? form.shippingDeclaration.name : isEdit && booking.shippingDeclaration?.fileName ? booking.shippingDeclaration.fileName : 'Choose file (PDF, JPG, PNG)…'}
              </span>
              <span className="ml-3 shrink-0 font-mono text-[10px] uppercase tracking-wide text-rust">Browse</span>
              <input type="file" accept="application/pdf,image/*" className="hidden" onChange={handleFileChange('shippingDeclaration')} />
            </label>
            {isEdit && booking.shippingDeclaration?.fileName && !form.shippingDeclaration && (
              <p className="mt-1 text-xs text-muted">Currently attached — choose a new file to replace it.</p>
            )}
            {errors.shippingDeclaration && <p className="mt-1 font-mono text-xs text-brick">{errors.shippingDeclaration}</p>}
          </div>
        </div>

        {/* Parties — Step 1 (required source info for the shipping declaration) */}
        <div className={`${sectionCls} ${visible(STEP.parties) ? '' : 'hidden'}`}>
          <h2 className={sectionTitleCls}>Parties</h2>

          <div>
            <label className={labelCls}>Consignee Contact <span className="normal-case text-muted/70">(preview — full details below)</span></label>
            <p className="border border-ink/20 bg-paper/60 px-3.5 py-2.5 text-sm text-ink">{consigneePreview || '-'}</p>
          </div>

          <p className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-rust">Shipper</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Name</label>
              <input value={form.shipper.name} onChange={setNested('shipper', 'name')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={form.shipper.email} onChange={setNested('shipper', 'email')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Phone 1</label>
              <input value={form.shipper.phone1} onChange={setNested('shipper', 'phone1')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Phone 2</label>
              <input value={form.shipper.phone2} onChange={setNested('shipper', 'phone2')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Address</label>
              <input value={form.shipper.address} onChange={setNested('shipper', 'address')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Tax Number</label>
              <input value={form.shipper.taxNumber} onChange={setNested('shipper', 'taxNumber')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>

          <p className="border-t border-line pt-4 font-mono text-xs font-bold uppercase tracking-[0.14em] text-rust">Consignee</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Name</label>
              <input value={form.consignee.name} onChange={setNested('consignee', 'name')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={form.consignee.email} onChange={setNested('consignee', 'email')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Phone 1</label>
              <input value={form.consignee.phone1} onChange={setNested('consignee', 'phone1')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Phone 2</label>
              <input value={form.consignee.phone2} onChange={setNested('consignee', 'phone2')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Address</label>
              <input value={form.consignee.address} onChange={setNested('consignee', 'address')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Tax Number</label>
              <input value={form.consignee.taxNumber} onChange={setNested('consignee', 'taxNumber')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>
        </div>

        {/* Carrier Booking Confirmation — Step 2 */}
        <div className={`${sectionCls} ${visible(STEP.carrierBooking) ? '' : 'hidden'}`}>
          <h2 className={sectionTitleCls}>Carrier Booking Confirmation</h2>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Select label="Carrier" searchable placeholder="Select carrier" options={carrierOptions} value={form.carrier} onChange={set('carrier')} />
            <div>
              <label className={labelCls}>Vessel Name</label>
              <input value={form.vesselName} onChange={setInput('vesselName')} className={`${inputCls} border-ink/30`} placeholder="e.g. MSC OSCAR" />
            </div>
            <div>
              <label className={labelCls}>Voyage No</label>
              <input value={form.voyageNo} onChange={setInput('voyageNo')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>B/L No</label>
              <input value={form.blNo} onChange={setInput('blNo')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelCls}>ETD</label>
              <input type="date" value={form.etd} onChange={setInput('etd')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>ATD</label>
              <input type="date" value={form.atd} onChange={setInput('atd')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>ETA</label>
              <input type="date" value={form.eta} onChange={setInput('eta')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>ATA</label>
              <input type="date" value={form.ata} onChange={setInput('ata')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Select label="Space Confirmation Status" options={SPACE_CONFIRMATION_OPTIONS} value={form.spaceConfirmationStatus} onChange={set('spaceConfirmationStatus')} />
            <div>
              <label className={labelCls}>Carrier Booking Ref</label>
              <input value={form.carrierBookingRef} onChange={setInput('carrierBookingRef')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>VO Contact Person</label>
              <input value={form.voContactPerson} onChange={setInput('voContactPerson')} className={`${inputCls} border-ink/30`} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div>
              <label className={labelCls}>SI Cut-off</label>
              <input type="datetime-local" value={form.siCutoff} onChange={setInput('siCutoff')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>VGM Cut-off</label>
              <input type="datetime-local" value={form.vgmCutoff} onChange={setInput('vgmCutoff')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>CY Gate-In Cut-off</label>
              <input type="datetime-local" value={form.cyGateInCutoff} onChange={setInput('cyGateInCutoff')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Select label="Booking Confirmation Status" options={BOOKING_CONFIRMATION_OPTIONS} value={form.bookingConfirmationStatus} onChange={set('bookingConfirmationStatus')} />
            <div>
              <label className={labelCls}>Booking Confirmation File <span className="normal-case text-muted/70">(FM-07-NV, optional)</span></label>
              <label className={`flex cursor-pointer items-center justify-between border bg-card px-3.5 py-2.5 text-sm text-muted transition-colors hover:border-ink/55 ${errors.bookingConfirmationFile ? 'border-brick' : 'border-ink/30'}`}>
                <span className="truncate">
                  {form.bookingConfirmationFile ? form.bookingConfirmationFile.name : isEdit && booking.bookingConfirmationFile?.fileName ? booking.bookingConfirmationFile.fileName : 'Choose file (PDF, JPG, PNG)…'}
                </span>
                <span className="ml-3 shrink-0 font-mono text-[10px] uppercase tracking-wide text-rust">Browse</span>
                <input type="file" accept="application/pdf,image/*" className="hidden" onChange={handleFileChange('bookingConfirmationFile')} />
              </label>
              {errors.bookingConfirmationFile && <p className="mt-1 font-mono text-xs text-brick">{errors.bookingConfirmationFile}</p>}
            </div>
          </div>
        </div>

        {/* Commercial — Step 2 */}
        <div className={`${sectionCls} ${visible(STEP.commercial) ? '' : 'hidden'}`}>
          <h2 className={sectionTitleCls}>Commercial</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
            <Select label="NVOCC" searchable placeholder="Select NVOCC" options={nvoccOptions} value={form.nvocc} onChange={set('nvocc')} />
            <Select label="Currency" searchable options={CURRENCY_OPTIONS} value={form.currency} onChange={set('currency')} />
            <div>
              <label className={labelCls}>Price</label>
              <input type="number" min="0" value={form.price} onChange={setInput('price')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Cost</label>
              <input type="number" min="0" value={form.cost} onChange={setInput('cost')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Free Time</label>
              <input type="date" value={form.freeTime} onChange={setInput('freeTime')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>
        </div>

        {/* Agents — Step 2 (part of the operational booking process) */}
        <div className={`${sectionCls} ${visible(STEP.agents) ? '' : 'hidden'}`}>
          <h2 className={sectionTitleCls}>Agents</h2>

          <p className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-rust">POL Agent</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Agent Name</label>
              <input value={form.polAgent.name} onChange={setNested('polAgent', 'name')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={form.polAgent.email} onChange={setNested('polAgent', 'email')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input value={form.polAgent.phone} onChange={setNested('polAgent', 'phone')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Address</label>
              <input value={form.polAgent.address} onChange={setNested('polAgent', 'address')} className={`${inputCls} border-ink/30`} />
            </div>
          </div>

          <p className="border-t border-line pt-4 font-mono text-xs font-bold uppercase tracking-[0.14em] text-rust">POD Agent</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Agent Name</label>
              <input value={form.podAgent.name} onChange={setNested('podAgent', 'name')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={form.podAgent.email} onChange={setNested('podAgent', 'email')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input value={form.podAgent.phone} onChange={setNested('podAgent', 'phone')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Address</label>
              <input value={form.podAgent.address} onChange={setNested('podAgent', 'address')} className={`${inputCls} border-ink/30`} />
            </div>
          </div>
        </div>

        {/* Containers — Step 3 (Depot / Container) */}
        <div className={`${sectionCls} ${visible(STEP.containers) ? '' : 'hidden'}`}>
          <h2 className={sectionTitleCls}>Containers</h2>

          <Select label="Depot" searchable placeholder="Select depot" options={depotOptions} value={form.depot} onChange={set('depot')} />
          <p className="font-mono text-xs text-muted">Required before this booking can be confirmed.</p>

          <div>
            <label className={labelCls}>Container Type &amp; Quantity <span className="text-rust">*</span></label>
            <ContainerSelector containerTypes={containerTypes} stockMap={stockMap} value={form.containers} onChange={set('containers')} />
            {errors.containers && <p className="mt-1 font-mono text-xs text-brick">{errors.containers}</p>}
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={labelCls}>Gate In Date</label>
              <input type="date" value={form.gateInDate} onChange={setInput('gateInDate')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Gate Out Date</label>
              <input type="date" value={form.gateOutDate} onChange={setInput('gateOutDate')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Container Location</label>
              <input value={form.containerLocation} onChange={setInput('containerLocation')} className={`${inputCls} border-ink/30`} placeholder="Yard A — Block 3" />
            </div>
          </div>

          {isEdit && booking.status === 'confirmed' && (
            <div>
              <label className={labelCls}>Allocated Containers — Fulfillment</label>
              <AllocatedContainersPanel bookingId={booking._id} canUpdate={canUpdate} />
            </div>
          )}
        </div>

        {/* Customs (Nafeza) — Step 4 (Final Shipping Declaration), booking-owned sub-block */}
        <div className={`${sectionCls} ${visible(STEP.customsNafeza) ? '' : 'hidden'}`}>
          <h2 className={sectionTitleCls}>Customs (Nafeza)</h2>
          <div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={form.customsSubmitted} onChange={(e) => set('customsSubmitted')(e.target.checked)} className="h-4 w-4" />
              Shipping permit submitted on Nafeza
            </label>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Nafeza Reference No</label>
              <input value={form.customsReferenceNo} onChange={setInput('customsReferenceNo')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            {isEdit && (
              <div>
                <span className={labelCls}>Submitted At</span>
                <p className="border border-ink/20 bg-paper/60 px-3.5 py-2.5 text-sm text-ink">{formatDateTime(booking.customsSubmittedAt)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Status & Notes — Step 5 (BL & Loading List), booking-owned sub-block */}
        <div className={`${sectionCls} ${visible(STEP.statusNotes) ? '' : 'hidden'}`}>
          <h2 className={sectionTitleCls}>Status &amp; Notes</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Select label="Manifest Status" options={MANIFEST_OPTIONS} value={form.manifestStatus} onChange={set('manifestStatus')} />
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <textarea rows={2} value={form.notes} onChange={setInput('notes')} className={`${inputCls} border-ink/30`} placeholder="Free text notes..." />
          </div>
        </div>
      </fieldset>

      {canUpdate && (
        <div className="flex justify-end border-t border-line pt-5">
          <button
            type="submit"
            disabled={submitting || isCancelled}
            className="bg-rust px-6 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-rust-dark disabled:opacity-50"
          >
            {submitting ? 'Saving…' : isEdit ? 'Save Booking details' : 'Create booking'}
          </button>
        </div>
      )}
    </form>
  )
}
