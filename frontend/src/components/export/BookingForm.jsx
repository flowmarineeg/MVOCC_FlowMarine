'use client'

import { useEffect, useState } from 'react'
import Select from '@/components/ui/Select'
import ContainerSelector from './ContainerSelector'
import * as stockApi from '@/services/stock'
import * as bookingApi from '@/services/exportBooking'
import * as quotationApi from '@/services/quotation'
import { useToast } from '@/components/ui/Toast'
import { CURRENCY_OPTIONS } from '@/constants/currencies'
import { COUNTRY_OPTIONS } from '@/constants/countries'
import { BOOKING_STEP_FIELDS, dropLockedFields } from '@/constants/jobSteps'
import SummaryCard from './SummaryCard'
import ContainerGrid, { ReconciliationPanel } from './ContainerGrid'

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

const emptyParty = { name: '', country: '', email: '', phone1: '', phone2: '', address: '', taxNumber: '' }
const emptyAgent = { name: '', email: '', phone: '', address: '' }

const JOB_STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'closed_invoiced', label: 'Closed - Invoiced' },
]
const SPACE_CONFIRMATION_OPTIONS = ['Requested', 'Confirmed', 'Rejected', 'Amended', 'Rolled', 'Cancelled'].map((v) => ({ value: v, label: v }))
const STUFFING_OPTIONS = ['Shipper premises', 'Depot CFS', 'Third-party CFS'].map((v) => ({ value: v, label: v }))
const CRO_ISSUER_OPTIONS = ['Carrier', 'Agent'].map((v) => ({ value: v, label: v }))
const PACKING_GROUP_OPTIONS = ['I', 'II', 'III', 'N/A'].map((v) => ({ value: v, label: v }))
const BOOKING_CONFIRMATION_OPTIONS = ['Not Issued', 'Issued'].map((v) => ({ value: v, label: v }))
const MANIFEST_OPTIONS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'CONFIRMED', label: 'Confirmed' },
]

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

// A party picked from the Parties master data -> the snapshot stored on the
// booking (name, country, first two contact phones, first contact email, ...).
function partySnapshot(p) {
  return {
    name: p.name || '',
    country: p.country || '',
    email: p.contacts?.[0]?.email || '',
    phone1: p.contacts?.[0]?.phone || '',
    phone2: p.contacts?.[1]?.phone || '',
    address: p.address || '',
    taxNumber: p.taxNumber || '',
  }
}

// Exporter = the shipper; importer = the consignee (and notify, when it is the
// same). Those three fields are never typed — they follow the picked parties.
const withDerived = (f) => ({
  ...f,
  exportTaxNumber: f.shipper.taxNumber || '',
  importTaxNumber: f.consignee.taxNumber || '',
  importCountry: f.consignee.country || '',
})

// One stock-unit slot per container the job needs: `${containerTypeId}:${n}`.
const slotKey = (type, n) => `${type}:${n}`

// The seal typed for each container slot, in slot order per container type.
function slotsFromAssignments(assignments = []) {
  const counters = {}
  const slots = {}
  assignments.forEach((a) => {
    const type = a.containerType?._id || a.containerType
    counters[type] = counters[type] ?? 0
    slots[slotKey(type, counters[type]++)] = { sealNumber: a.sealNumber || '' }
  })
  return slots
}

function emptyForm() {
  return {
    clientName: '', clientPhone: '', clientEmail: '',
    pol: '', pod: '', commodity: '',
    ucrNumber: '', exportTaxNumber: '', importTaxNumber: '', importCountry: '', packagesCount: '',
    grossWeight: '', netWeight: '', hsCode: '', packageType: '',
    isDangerous: false, dangerousClass: '', unNumber: '',
    shippingDeclaration: null,
    containers: [{ containerType: '', quantity: 1 }],
    containerSlots: {},
    jobStatus: 'open',
    carrier: '', vesselName: '', voyageNo: '', etd: '', atd: '', eta: '', ata: '',
    spaceConfirmationStatus: 'Requested', carrierBookingRef: '', voContactPerson: '',
    siCutoff: '', vgmCutoff: '', cyGateInCutoff: '',
    bookingConfirmationStatus: 'Not Issued', bookingConfirmationFile: null,
    customsSubmitted: false, customsReferenceNo: '',
    depot: '', gateInDate: '', gateOutDate: '',
    nvocc: '', currency: 'USD', price: '', cost: '', freeTime: '',
    shipper: { ...emptyParty }, consignee: { ...emptyParty }, notify: { ...emptyParty },
    shipperParty: '', consigneeParty: '', notifyParty: '', notifySameAsConsignee: false,
    podAgent: { ...emptyAgent }, podAgentRef: '',
    manifestStatus: 'PENDING', notes: '',
    // Sprint 007 — Step 1
    cargoReadinessDate: '', proformaInvoiceNo: '', proformaInvoiceDate: '', acidNumber: '', cbm: '', shipperReference: '',
    countryOfOrigin: '', exporterLicenceNo: '', stuffingLocationType: '', stuffingDate: '', specialInstructions: '', weightVarianceReason: '',
    properShippingName: '', subsidiaryRisk: '', packingGroup: '', flashPoint: '', marinePollutant: false, emergencyContact: '',
    setTemperature: '', ventilationHumidity: '', oogDimensions: '',
    // Step 2
    polTerminal: '', podTerminal: '', serviceLoopCode: '', vesselImo: '', cyOpeningCutoff: '', customsCutoff: '', dgCutoff: '',
    bookingRequestSentAt: '', confirmedEquipment: {}, dgAcceptanceRef: '', voFreeTimeDays: '',
    // Step 3
    croNumber: '', croIssueDate: '', croValidityDate: '', croIssuedBy: '', releasedTo: '', truckPlateDriver: '', reconciliationReason: '',
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
    grossWeight: booking.grossWeight ?? '',
    netWeight: booking.netWeight ?? '',
    hsCode: booking.hsCode || '',
    packageType: booking.packageType || '',
    isDangerous: !!booking.isDangerous,
    dangerousClass: booking.dangerousClass || '',
    unNumber: booking.unNumber || '',
    shippingDeclaration: null,
    containers: (booking.containers || []).map((c) => ({
      containerType: c.containerType?._id || c.containerType,
      quantity: c.quantity,
    })),
    containerSlots: slotsFromAssignments(booking.containerAssignments),
    jobStatus: booking.jobStatus || 'open',
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
    nvocc: booking.nvocc?._id || booking.nvocc || '',
    currency: booking.currency || 'USD',
    price: booking.price ?? '',
    cost: booking.cost ?? '',
    freeTime: toDateInput(booking.freeTime),
    shipper: { ...emptyParty, ...(booking.shipper || {}) },
    consignee: { ...emptyParty, ...(booking.consignee || {}) },
    notify: { ...emptyParty, ...(booking.notify || {}) },
    shipperParty: booking.shipperParty?._id || booking.shipperParty || '',
    consigneeParty: booking.consigneeParty?._id || booking.consigneeParty || '',
    notifyParty: booking.notifyParty?._id || booking.notifyParty || '',
    notifySameAsConsignee: !!booking.notifySameAsConsignee,
    podAgent: { ...emptyAgent, ...(booking.podAgent || {}) },
    podAgentRef: booking.podAgentRef?._id || booking.podAgentRef || '',
    manifestStatus: booking.manifestStatus || 'PENDING',
    notes: booking.notes || '',
    cargoReadinessDate: toDateInput(booking.cargoReadinessDate),
    proformaInvoiceNo: booking.proformaInvoiceNo || '',
    proformaInvoiceDate: toDateInput(booking.proformaInvoiceDate),
    acidNumber: booking.acidNumber || '',
    cbm: booking.cbm ?? '',
    shipperReference: booking.shipperReference || '',
    countryOfOrigin: booking.countryOfOrigin || '',
    exporterLicenceNo: booking.exporterLicenceNo || '',
    stuffingLocationType: booking.stuffingLocationType || '',
    stuffingDate: toDateInput(booking.stuffingDate),
    specialInstructions: booking.specialInstructions || '',
    weightVarianceReason: booking.weightVarianceReason || '',
    properShippingName: booking.properShippingName || '',
    subsidiaryRisk: booking.subsidiaryRisk || '',
    packingGroup: booking.packingGroup || '',
    flashPoint: booking.flashPoint ?? '',
    marinePollutant: !!booking.marinePollutant,
    emergencyContact: booking.emergencyContact || '',
    setTemperature: booking.setTemperature ?? '',
    ventilationHumidity: booking.ventilationHumidity || '',
    oogDimensions: booking.oogDimensions || '',
    polTerminal: booking.polTerminal || '',
    podTerminal: booking.podTerminal || '',
    serviceLoopCode: booking.serviceLoopCode || '',
    vesselImo: booking.vesselImo || '',
    cyOpeningCutoff: toDateTimeInput(booking.cyOpeningCutoff),
    customsCutoff: toDateTimeInput(booking.customsCutoff),
    dgCutoff: toDateTimeInput(booking.dgCutoff),
    bookingRequestSentAt: toDateTimeInput(booking.bookingRequestSentAt),
    confirmedEquipment: Object.fromEntries((booking.confirmedEquipment || []).map((e) => [e.containerType?._id || e.containerType, e.quantity])),
    dgAcceptanceRef: booking.dgAcceptanceRef || '',
    voFreeTimeDays: booking.voFreeTimeDays ?? '',
    croNumber: booking.croNumber || '',
    croIssueDate: toDateInput(booking.croIssueDate) || toDateInput(new Date()),
    croValidityDate: toDateInput(booking.croValidityDate),
    croIssuedBy: booking.croIssuedBy || '',
    releasedTo: booking.releasedTo || '',
    truckPlateDriver: booking.truckPlateDriver || '',
    reconciliationReason: booking.reconciliationReason || '',
  }
}

const labelCls = 'mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted'
const inputCls = 'w-full border bg-card px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust'
const sectionCls = 'space-y-5 border border-ink/25 bg-card p-5 sm:p-6'
const sectionTitleCls = 'font-display text-base font-bold uppercase tracking-wide text-ink'
const subTitleCls = 'font-mono text-xs font-bold uppercase tracking-[0.14em] text-rust'

// A value shown but not editable (data that comes from the quotation or from a
// master-data pick).
function ReadOnly({ label, children, className = '' }) {
  return (
    <div className={className}>
      <span className={labelCls}>{label}</span>
      <p className="min-h-[42px] border border-ink/20 bg-paper/60 px-3.5 py-2.5 text-sm text-ink">{children || '-'}</p>
    </div>
  )
}

// The details copied from a picked party / agent.
function PartyDetails({ data }) {
  if (!data?.name) return <p className="font-mono text-xs text-muted">Nothing selected yet.</p>
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <ReadOnly label="Name">{data.name}</ReadOnly>
      <ReadOnly label="Country">{data.country}</ReadOnly>
      <ReadOnly label="Email">{data.email}</ReadOnly>
      <ReadOnly label="Phone 1">{data.phone1 ?? data.phone}</ReadOnly>
      {'phone2' in data && <ReadOnly label="Phone 2">{data.phone2}</ReadOnly>}
      <ReadOnly label="Address">{data.address}</ReadOnly>
      {'taxNumber' in data && <ReadOnly label="Tax Number">{data.taxNumber}</ReadOnly>}
    </div>
  )
}

// Depot / Container step, before the booking is confirmed: one row per container
// TYPE. The container numbers are not chosen by anyone — the list simply shows
// the depot's oldest free units of that type (oldest -> newest, as many as the
// job needs), and confirming the booking allocates exactly those. Only the seal
// of each container is typed here.
function ContainerAutoRows({ rows, slots, onChange, depot, nvocc, containerTypes, disabled }) {
  const [stock, setStock] = useState({}) // typeId -> free units, oldest first
  const typeKey = rows.map((r) => r.containerType).join(',')

  useEffect(() => {
    if (!depot || !typeKey) return undefined
    let cancelled = false
    Promise.all(
      typeKey.split(',').map((type) =>
        stockApi.getContainers({ containerType: type, depot, nvocc: nvocc || undefined }).then((units) => [
          type,
          units.filter((u) => u.status === 'available').sort((x, y) => new Date(x.createdAt) - new Date(y.createdAt)),
        ])
      )
    )
      .then((pairs) => { if (!cancelled) setStock(Object.fromEntries(pairs)) })
      .catch(() => { if (!cancelled) setStock({}) })
    return () => { cancelled = true }
  }, [depot, nvocc, typeKey])

  const typeCode = (id) => containerTypes.find((t) => t._id === id)?.code || '—'
  const setSeal = (key, sealNumber) => onChange({ ...slots, [key]: { sealNumber } })

  if (!depot) return <p className="font-mono text-xs text-muted">Select a depot to see the containers that will be assigned from its stock.</p>

  const shortBy = rows.map((row) => ({ type: row.containerType, short: Math.max(row.quantity - (stock[row.containerType] || []).length, 0) })).filter((x) => x.short > 0)

  return (
    <div className="space-y-2">
      {/* one row per container (its own type on every row); scrolls inside a fixed max height */}
      <div className="max-h-72 overflow-auto border border-ink/25" data-testid="container-scroll">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b-2 border-ink text-left font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              <th className="px-3 py-2">Container Type</th>
              <th className="px-3 py-2">Container No. (auto — oldest stock first)</th>
              <th className="px-3 py-2">Seal</th>
            </tr>
          </thead>
          <tbody>
            {rows.flatMap((row) =>
              Array.from({ length: row.quantity }, (_, n) => {
                const key = slotKey(row.containerType, n)
                const unit = (stock[row.containerType] || [])[n]
                return (
                  <tr key={key} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 font-mono text-ink" data-testid="slot-type">{typeCode(row.containerType)}</td>
                    <td className="px-3 py-2">
                      <span
                        data-testid="auto-container"
                        className={`inline-block w-48 border border-ink/20 bg-paper/60 px-3 py-2 font-mono text-sm ${unit ? 'text-ink' : 'text-brick'}`}
                      >
                        {unit ? unit.containerNumber : 'No free stock'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        aria-label="Seal number"
                        value={slots[key]?.sealNumber || ''}
                        onChange={(e) => setSeal(key, e.target.value)}
                        disabled={disabled}
                        placeholder="Seal no."
                        className={`${inputCls} border-ink/30 font-mono`}
                      />
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      {shortBy.map((x) => (
        <p key={x.type} className="font-mono text-[11px] text-brick">{typeCode(x.type)}: {x.short} short — not enough free containers at this depot.</p>
      ))}
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
  jobIdentity: 2, // Job No/Status, Client — Header & Job Info
  shipmentCargo: 1,
  parties: 1,
  carrierBooking: 2,
  commercial: 2,
  customsNafeza: 4,
  containers: 3,
  statusNotes: 5,
}

export default function BookingForm({
  booking = null,
  prefill = null,
  quotation: quotationProp = null,
  quotationId = null,
  activeStep,
  ports = [],
  containerTypes = [],
  carriers = [], // vessel operators (VO)
  vessels = [],
  nvoccs = [],
  depots = [],
  parties = [],
  agents = [],
  packages = [],
  stockMap = {},
  submitting = false,
  canUpdate = true,
  onSubmit,
  onInvalidStep,
  jobState = null, // Sprint 007 — computed step state from the server (issues, warnings, reconciliation ...)
  lockedSteps = [],
  onJobChanged,
}) {
  const toast = useToast()
  const isEdit = !!booking
  const isCancelled = isEdit && booking.status === 'cancelled'
  const isConfirmed = isEdit && booking.status === 'confirmed'
  const isLocked = isCancelled || !canUpdate
  const [form, setForm] = useState(() => buildInitialForm(booking, prefill))
  const [errors, setErrors] = useState({})

  // A job that came from a quotation shows that quotation's data (client,
  // container types, DG info + attachments, commercial) read-only; a job created
  // directly keeps those fields editable.
  const quotation = booking?.quotation && typeof booking.quotation === 'object' ? booking.quotation : quotationProp
  const hasQuotation = !!(booking?.quotation || quotationId)

  const set = (field) => (v) => setForm((f) => ({ ...f, [field]: v }))
  const setInput = (field) => (e) => set(field)(e.target.value)

  // undefined activeStep (the create page) -> every section always shown.
  const visible = (step) => activeStep === undefined || activeStep === step
  const locked = (step) => lockedSteps.includes(step)

  const portOptions = ports.map((p) => ({ value: p._id, label: `${p.code} — ${p.name}` }))
  const carrierOptions = carriers.map((c) => ({ value: c._id, label: `${c.code} — ${c.name}` }))
  const depotOptions = depots.map((d) => ({ value: d._id, label: `${d.code} — ${d.name}` }))
  const portLabel = (id) => ports.find((p) => p._id === id)?.code || ''

  // ── Parties (master data) ───────────────────────────────────────────
  const partyOptions = (type) =>
    parties.filter((p) => p.partyType === type).map((p) => ({ value: p._id, label: p.country ? `${p.name} — ${p.country}` : p.name }))

  const selectParty = (kind, id) =>
    setForm((f) => {
      const p = parties.find((x) => x._id === id)
      const snap = p ? partySnapshot(p) : { ...emptyParty }
      const next = { ...f, [`${kind}Party`]: id || '', [kind]: snap }
      if (kind === 'consignee' && f.notifySameAsConsignee) {
        next.notify = { ...snap }
        next.notifyParty = id || ''
      }
      return withDerived(next)
    })

  const toggleNotifySame = (checked) =>
    setForm((f) => ({
      ...f,
      notifySameAsConsignee: checked,
      ...(checked ? { notify: { ...f.consignee }, notifyParty: f.consigneeParty } : {}),
    }))

  const selectPodAgent = (id) =>
    setForm((f) => {
      const a = agents.find((x) => x._id === id)
      return {
        ...f,
        podAgentRef: id || '',
        podAgent: a
          ? { name: a.name, email: a.contacts?.[0]?.email || '', phone: a.contacts?.[0]?.phone || '', address: [a.address, a.city, a.country].filter(Boolean).join(', ') }
          : { ...emptyAgent },
      }
    })

  // ── Package type / vessel / VO contact: master-data lists ───────────
  const packageOptions = packages.map((p) => ({ value: p.name, label: p.name }))
  if (form.packageType && !packageOptions.some((o) => o.value === form.packageType)) packageOptions.unshift({ value: form.packageType, label: form.packageType })

  const vesselOptions = vessels
    .filter((v) => !form.carrier || (v.vesselOperator?._id || v.vesselOperator) === form.carrier)
    .map((v) => ({ value: v.name, label: v.name }))
  if (form.vesselName && !vesselOptions.some((o) => o.value === form.vesselName)) vesselOptions.unshift({ value: form.vesselName, label: form.vesselName })

  const selectedVo = carriers.find((c) => c._id === form.carrier)
  const voContactOptions = (selectedVo?.contacts || []).map((c) => ({ value: c.name, label: c.phone ? `${c.name} — ${c.phone}` : c.name }))
  if (form.voContactPerson && !voContactOptions.some((o) => o.value === form.voContactPerson)) voContactOptions.unshift({ value: form.voContactPerson, label: form.voContactPerson })

  const changeVessel = (name) =>
    setForm((f) => {
      const v = vessels.find((x) => x.name === name && (!f.carrier || (x.vesselOperator?._id || x.vesselOperator) === f.carrier))
      return { ...f, vesselName: name || '', ...(v?.imoNumber ? { vesselImo: v.imoNumber } : {}) }
    })

  const changeVo = (id) =>
    setForm((f) => {
      const stillValid = (name) => vessels.some((v) => v.name === name && (v.vesselOperator?._id || v.vesselOperator) === id)
      return { ...f, carrier: id, vesselName: id && !stillValid(f.vesselName) ? '' : f.vesselName, voContactPerson: '' }
    })

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

  const downloadMsds = (file) => {
    const run = booking ? bookingApi.downloadMsds(booking._id, file) : quotationApi.downloadMsds(quotation?._id, file)
    run.catch((err) => toast(err.message, 'error'))
  }

  const validate = () => {
    const next = {}
    if (!form.clientName.trim()) next.clientName = 'Client name is required'
    if (!form.clientPhone.trim()) next.clientPhone = 'Client phone is required'
    if (!/^\S+@\S+\.\S+$/.test(form.clientEmail)) next.clientEmail = 'Enter a valid client email'
    if (!form.pol) next.pol = 'Port of loading is required'
    if (!form.pod) next.pod = 'Port of discharge is required'
    if (!form.commodity.trim()) next.commodity = 'Commodity is required'
    if (form.isDangerous && !form.dangerousClass.trim()) next.dangerousClass = 'Class number is required'
    if (form.isDangerous && !form.unNumber.trim()) next.unNumber = 'UN number is required'
    const validContainers = form.containers.filter((c) => c.containerType && c.quantity >= 1)
    if (validContainers.length === 0) next.containers = 'Add at least one container entry'
    setErrors((prev) => ({ ...prev, ...next }))
    // Jump to the earliest step holding an error, so a failed submit from a
    // different step doesn't look like a silent no-op.
    if (onInvalidStep) {
      const fieldStep = { pol: 1, pod: 1, commodity: 1, dangerousClass: 1, unNumber: 1, containers: 1, clientName: 2, clientPhone: 2, clientEmail: 2 }
      const steps = Object.keys(next).map((k) => fieldStep[k]).filter(Boolean)
      if (steps.length) onInvalidStep(Math.min(...steps))
    }
    return Object.keys(next).length === 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!validate()) return

    const containers = mergeContainerRows(form.containers)

    const fd = new FormData()
    fd.append('clientName', form.clientName.trim())
    fd.append('clientPhone', form.clientPhone.trim())
    fd.append('clientEmail', form.clientEmail.trim())
    fd.append('pol', form.pol)
    fd.append('pod', form.pod)
    fd.append('commodity', form.commodity.trim())
    ;['ucrNumber', 'exportTaxNumber', 'importTaxNumber', 'importCountry', 'hsCode', 'packageType', 'vesselName', 'voyageNo', 'carrierBookingRef', 'voContactPerson', 'customsReferenceNo', 'notes'].forEach((k) => {
      if (form[k].trim()) fd.append(k, form[k].trim())
    })
    ;['packagesCount', 'grossWeight', 'netWeight', 'price', 'cost'].forEach((k) => {
      if (form[k] !== '') fd.append(k, form[k])
    })
    ;['etd', 'eta', 'ata', 'siCutoff', 'vgmCutoff', 'cyGateInCutoff', 'gateInDate', 'gateOutDate', 'freeTime'].forEach((k) => {
      if (form[k]) fd.append(k, form[k])
    })
    fd.append('isDangerous', String(form.isDangerous))
    if (form.isDangerous) {
      fd.append('dangerousClass', form.dangerousClass.trim())
      fd.append('unNumber', form.unNumber.trim())
    }
    fd.append('jobStatus', form.jobStatus)
    fd.append('spaceConfirmationStatus', form.spaceConfirmationStatus)
    fd.append('bookingConfirmationStatus', form.bookingConfirmationStatus)
    fd.append('customsSubmitted', String(form.customsSubmitted))
    fd.append('manifestStatus', form.manifestStatus)
    // Sprint 007 — PRD fields of Steps 1-3 ('' clears a previously saved value)
    ;['cargoReadinessDate', 'proformaInvoiceDate', 'stuffingDate', 'cyOpeningCutoff', 'customsCutoff', 'dgCutoff', 'bookingRequestSentAt', 'croIssueDate', 'croValidityDate'].forEach((k) => fd.append(k, form[k] || ''))
    ;['proformaInvoiceNo', 'shipperReference', 'countryOfOrigin', 'exporterLicenceNo', 'specialInstructions', 'weightVarianceReason', 'polTerminal', 'podTerminal', 'serviceLoopCode', 'vesselImo', 'dgAcceptanceRef', 'croNumber', 'releasedTo', 'truckPlateDriver', 'reconciliationReason', 'stuffingLocationType', 'croIssuedBy'].forEach((k) => fd.append(k, String(form[k] ?? '').trim()))
    fd.append('acidNumber', isEgypt ? form.acidNumber.trim() : '')
    ;['cbm', 'voFreeTimeDays', 'setTemperature', 'flashPoint'].forEach((k) => fd.append(k, form[k] === '' ? '' : String(form[k])))
    if (form.isDangerous) {
      ;['properShippingName', 'subsidiaryRisk', 'packingGroup', 'emergencyContact'].forEach((k) => fd.append(k, String(form[k] ?? '').trim()))
      fd.append('marinePollutant', String(form.marinePollutant))
    }
    fd.append('ventilationHumidity', hasType(/RF$/i) ? form.ventilationHumidity.trim() : '')
    fd.append('oogDimensions', hasType(/(OT|FR)$/i) ? form.oogDimensions.trim() : '')
    fd.append('confirmedEquipment', JSON.stringify(containerRows.filter((r) => form.confirmedEquipment[r.containerType] !== undefined && form.confirmedEquipment[r.containerType] !== '').map((r) => ({ containerType: r.containerType, quantity: Number(form.confirmedEquipment[r.containerType]) }))))
    if (form.carrier) fd.append('carrier', form.carrier)
    if (form.depot) fd.append('depot', form.depot)
    if (form.nvocc) fd.append('nvocc', form.nvocc)
    fd.append('currency', form.currency)
    fd.append('shipper', JSON.stringify(form.shipper))
    fd.append('consignee', JSON.stringify(form.consignee))
    fd.append('notify', JSON.stringify(form.notify))
    fd.append('notifySameAsConsignee', String(form.notifySameAsConsignee))
    // '' clears a previously picked party / agent
    fd.append('shipperParty', form.shipperParty)
    fd.append('consigneeParty', form.consigneeParty)
    fd.append('notifyParty', form.notifyParty)
    fd.append('podAgent', JSON.stringify(form.podAgent))
    fd.append('podAgentRef', form.podAgentRef)
    fd.append('containers', JSON.stringify(containers))
    // one seal entry per container slot, in order (applied to the oldest free units at confirm)
    const assignments = containers.flatMap((row) =>
      Array.from({ length: row.quantity }, (_, n) => ({
        containerType: row.containerType,
        sealNumber: (form.containerSlots[slotKey(row.containerType, n)]?.sealNumber || '').trim(),
      }))
    )
    // (a booking with no seal typed anywhere sends nothing)
    if (assignments.every((a) => !a.sealNumber)) assignments.length = 0
    fd.append('containerAssignments', JSON.stringify(assignments))
    if (form.shippingDeclaration) fd.append('shippingDeclaration', form.shippingDeclaration)
    if (form.bookingConfirmationFile) fd.append('bookingConfirmationFile', form.bookingConfirmationFile)
    if (quotationId) fd.append('quotation', quotationId)
    // a completed step is locked on the server — never re-send its fields
    dropLockedFields(fd, lockedSteps, BOOKING_STEP_FIELDS)

    onSubmit(fd)
  }

  const containerRows = mergeContainerRows(form.containers)
  const typeCode = (id) => containerTypes.find((t) => t._id === id)?.code || '—'
  const hasType = (re) => containerRows.some((r) => re.test(typeCode(r.containerType)))
  const isEgypt = /egypt/i.test(ports.find((p) => p._id === form.pod)?.country || '')
  const nvoccLabel = (() => { const n = nvoccs.find((x) => x._id === form.nvocc); return n ? `${n.code} — ${n.name}` : '' })()
  const equipmentText = containerRows.map((r) => `${typeCode(r.containerType)} × ${r.quantity}`).join('  ·  ')
  const moved = (v, q) => v !== '' && Number(q) > 0 && Math.abs(Number(v) - Number(q)) / Number(q) > 0.05
  const weightMoved = !!quotation && (moved(form.grossWeight, quotation.grossWeight) || moved(form.cbm, quotation.cbm))
  const msdsFiles = quotation?.msdsFiles || []
  const freeTimeShown = quotation?.freeTimeBuyingDays != null ? `${quotation.freeTimeBuyingDays} days` : form.freeTime ? new Date(form.freeTime).toLocaleDateString() : ''

  const renderParty = (kind, title, { disabled = false } = {}) => (
    <div className="space-y-3">
      <p className={subTitleCls}>{title}</p>
      <Select
        clearable
        searchable
        label={`${title} (Parties master data)`}
        placeholder={`Select ${title.toLowerCase()}`}
        options={partyOptions(kind)}
        value={form[`${kind}Party`]}
        onChange={(id) => selectParty(kind, id)}
        disabled={disabled}
      />
      <PartyDetails data={form[kind]} />
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset disabled={isLocked} className="space-y-6">
        {/* Header & Job Info — job/client identity (Step 2 — Booking) */}
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

          {hasQuotation ? (
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                <ReadOnly label="Client Name">{form.clientName}</ReadOnly>
                <ReadOnly label="Client Phone">{form.clientPhone}</ReadOnly>
                <ReadOnly label="Client Email">{form.clientEmail}</ReadOnly>
              </div>
              <p className="font-mono text-xs text-muted">Client details come from the quotation.</p>
              {(errors.clientName || errors.clientPhone || errors.clientEmail) && (
                <p className="font-mono text-xs text-brick">{errors.clientName || errors.clientPhone || errors.clientEmail} — fix it on the quotation.</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <div>
                <label className={labelCls}>Client Name <span className="text-rust">*</span></label>
                <input value={form.clientName} disabled={locked(1)} onChange={setInput('clientName')} className={`${inputCls} ${errors.clientName ? 'border-brick' : 'border-ink/30'}`} />
                {errors.clientName && <p className="mt-1 font-mono text-xs text-brick">{errors.clientName}</p>}
              </div>
              <div>
                <label className={labelCls}>Client Phone <span className="text-rust">*</span></label>
                <input value={form.clientPhone} disabled={locked(1)} onChange={setInput('clientPhone')} className={`${inputCls} ${errors.clientPhone ? 'border-brick' : 'border-ink/30'}`} />
                {errors.clientPhone && <p className="mt-1 font-mono text-xs text-brick">{errors.clientPhone}</p>}
              </div>
              <div>
                <label className={labelCls}>Client Email <span className="text-rust">*</span></label>
                <input type="email" value={form.clientEmail} disabled={locked(1)} onChange={setInput('clientEmail')} className={`${inputCls} ${errors.clientEmail ? 'border-brick' : 'border-ink/30'}`} />
                {errors.clientEmail && <p className="mt-1 font-mono text-xs text-brick">{errors.clientEmail}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Shipment & Cargo — Step 1 */}
        <fieldset disabled={locked(1)} className={`${sectionCls} min-w-0 ${visible(STEP.shipmentCargo) ? '' : 'hidden'}`}>
          <h2 className={sectionTitleCls}>Shipment &amp; Cargo</h2>

          {hasQuotation && quotation && (
            <SummaryCard
              testId="quotation-summary"
              title="Quotation Summary (read-only)"
              items={[
                { label: 'Quotation', value: quotation.quotationNo },
                { label: 'POL', value: portLabel(form.pol) },
                { label: 'POD', value: portLabel(form.pod) },
                { label: 'Container types & quantity', value: equipmentText },
                { label: 'Carrier', value: nvoccLabel },
                { label: 'Payment term', value: quotation.paymentTerms },
                { label: 'Dangerous goods', value: form.isDangerous ? `Yes — UN ${String(form.unNumber || '').replace(/^UN/i, '')}${form.dangerousClass ? `, class ${form.dangerousClass}` : ''}` : 'No' },
              ]}
            />
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

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Select label="Port of Loading (POL)" required searchable placeholder="Select POL" options={portOptions} value={form.pol} onChange={set('pol')} error={errors.pol} />
            <Select label="Port of Discharge (POD)" required searchable placeholder="Select POD" options={portOptions} value={form.pod} onChange={set('pod')} error={errors.pod} />
          </div>

          {hasQuotation ? (
            <ReadOnly label="Container Types (from the quotation)">
              {containerRows.length ? containerRows.map((r) => `${typeCode(r.containerType)} × ${r.quantity}`).join('  ·  ') : ''}
            </ReadOnly>
          ) : (
            <div>
              <label className={labelCls}>Container Type &amp; Quantity <span className="text-rust">*</span></label>
              <ContainerSelector containerTypes={containerTypes} stockMap={stockMap} value={form.containers} onChange={set('containers')} />
              {errors.containers && <p className="mt-1 font-mono text-xs text-brick">{errors.containers}</p>}
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Commodity <span className="text-rust">*</span></label>
              <input value={form.commodity} onChange={setInput('commodity')} className={`${inputCls} ${errors.commodity ? 'border-brick' : 'border-ink/30'}`} placeholder="e.g. Frozen poultry" />
              {errors.commodity && <p className="mt-1 font-mono text-xs text-brick">{errors.commodity}</p>}
            </div>
            <div>
              <label className={labelCls}>HS Code</label>
              <input value={form.hsCode} onChange={setInput('hsCode')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>

          <div className="sm:w-1/2 sm:pr-2.5">
            <label className={labelCls}>UCR Number</label>
            <input value={form.ucrNumber} onChange={setInput('ucrNumber')} className={`${inputCls} border-ink/30 font-mono`} />
          </div>

          {/* Sprint 007 — customs & documents (PRD S1-12 .. S1-28) */}
          <div className="space-y-5 border-t border-line pt-4">
            <p className={subTitleCls}>Customs &amp; Documents</p>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <div>
                <label className={labelCls}>Cargo Readiness Date <span className="text-rust">*</span></label>
                <input type="date" aria-label="Cargo readiness date" value={form.cargoReadinessDate} onChange={setInput('cargoReadinessDate')} className={`${inputCls} border-ink/30 font-mono`} />
              </div>
              <div>
                <label className={labelCls}>Proforma Invoice No <span className="text-rust">*</span></label>
                <input aria-label="Proforma invoice number" value={form.proformaInvoiceNo} onChange={setInput('proformaInvoiceNo')} className={`${inputCls} border-ink/30 font-mono`} />
              </div>
              <div>
                <label className={labelCls}>Proforma Invoice Date <span className="text-rust">*</span></label>
                <input type="date" aria-label="Proforma invoice date" value={form.proformaInvoiceDate} onChange={setInput('proformaInvoiceDate')} className={`${inputCls} border-ink/30 font-mono`} />
              </div>
            </div>
            {isEgypt && (
              <div className="sm:w-1/2 sm:pr-2.5">
                <label className={labelCls}>ACID Number <span className="text-rust">*</span> <span className="normal-case text-muted/70">(19 digits, Egypt destinations)</span></label>
                <input aria-label="ACID number" inputMode="numeric" maxLength={19} value={form.acidNumber} onChange={setInput('acidNumber')} className={`${inputCls} border-ink/30 font-mono`} />
              </div>
            )}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <Select label="Country of Origin *" searchable clearable placeholder="Select country" options={COUNTRY_OPTIONS} value={form.countryOfOrigin} onChange={set('countryOfOrigin')} />
              <div>
                <label className={labelCls}>Shipper Reference / PO No</label>
                <input aria-label="Shipper reference" value={form.shipperReference} onChange={setInput('shipperReference')} className={`${inputCls} border-ink/30 font-mono`} />
              </div>
              <div>
                <label className={labelCls}>Exporter Licence No</label>
                <input aria-label="Exporter licence" value={form.exporterLicenceNo} onChange={setInput('exporterLicenceNo')} className={`${inputCls} border-ink/30 font-mono`} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <Select label="Stuffing Location *" clearable placeholder="Select location type" options={STUFFING_OPTIONS} value={form.stuffingLocationType} onChange={set('stuffingLocationType')} />
              <div>
                <label className={labelCls}>Stuffing Date</label>
                <input type="date" aria-label="Stuffing date" value={form.stuffingDate} onChange={setInput('stuffingDate')} className={`${inputCls} border-ink/30 font-mono`} />
              </div>
              <div>
                <label className={labelCls}>Special Instructions</label>
                <input aria-label="Special instructions" value={form.specialInstructions} onChange={setInput('specialInstructions')} className={`${inputCls} border-ink/30`} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls}>No. of Packages</label>
              <input type="number" min="0" value={form.packagesCount} onChange={setInput('packagesCount')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <Select clearable searchable label="Package Type" placeholder="Select package type" options={packageOptions} value={form.packageType} onChange={set('packageType')} />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Gross Weight (kg)</label>
              <input type="number" min="0" value={form.grossWeight} onChange={setInput('grossWeight')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Net Weight (kg)</label>
              <input type="number" min="0" value={form.netWeight} onChange={setInput('netWeight')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Total CBM <span className="text-rust">*</span></label>
              <input type="number" min="0" aria-label="Total CBM" value={form.cbm} onChange={setInput('cbm')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            {weightMoved && (
              <div>
                <label className={labelCls}>Reason for the change <span className="text-rust">*</span> <span className="normal-case text-brick">(more than 5% from the quotation)</span></label>
                <input aria-label="Weight variance reason" value={form.weightVarianceReason} onChange={setInput('weightVarianceReason')} className={`${inputCls} border-ink/30`} />
              </div>
            )}
          </div>
          {quotation && (quotation.grossWeight || quotation.cbm) && (
            <p className="font-mono text-[11px] text-muted">Quoted: {quotation.grossWeight ? `${quotation.grossWeight} kg` : '-'} · {quotation.cbm ? `${quotation.cbm} CBM` : '-'}</p>
          )}
          {quotation?.commodity && form.commodity.trim() !== quotation.commodity.trim() && (
            <p className="font-mono text-[11px] text-signal" data-testid="commodity-variance">Commodity differs from the quotation (&quot;{quotation.commodity}&quot;) — allowed, shown for the record.</p>
          )}

          {hasType(/RF$/i) && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Set Temperature (°C) <span className="text-rust">*</span></label>
                <input type="number" aria-label="Set temperature" value={form.setTemperature} onChange={setInput('setTemperature')} className={`${inputCls} border-ink/30 font-mono`} />
              </div>
              <div>
                <label className={labelCls}>Ventilation / Humidity</label>
                <input aria-label="Ventilation" value={form.ventilationHumidity} onChange={setInput('ventilationHumidity')} className={`${inputCls} border-ink/30`} />
              </div>
            </div>
          )}
          {hasType(/(OT|FR)$/i) && (
            <div>
              <label className={labelCls}>Out-of-gauge Dimensions</label>
              <input aria-label="OOG dimensions" value={form.oogDimensions} onChange={setInput('oogDimensions')} className={`${inputCls} border-ink/30`} />
            </div>
          )}

          {/* Dangerous goods: the flag, UN number and attachments come from the quotation */}
          <div className="space-y-4 border-t border-line pt-4">
            <p className={subTitleCls}>Dangerous Goods</p>
            {hasQuotation ? (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                <ReadOnly label="Dangerous Goods">{form.isDangerous ? 'Yes' : 'No'}</ReadOnly>
                {form.isDangerous && <ReadOnly label="UN Number (from the quotation)">{form.unNumber}</ReadOnly>}
              </div>
            ) : (
              <div>
                <label className={labelCls}>Dangerous Goods</label>
                <div className="flex border border-ink/30">
                  <button type="button" onClick={() => set('isDangerous')(false)} className={`flex-1 py-2.5 text-sm font-semibold uppercase tracking-wide transition-colors ${!form.isDangerous ? 'bg-ink text-paper' : 'bg-card text-muted hover:text-ink'}`}>No</button>
                  <button type="button" onClick={() => set('isDangerous')(true)} className={`flex-1 border-l border-ink/30 py-2.5 text-sm font-semibold uppercase tracking-wide transition-colors ${form.isDangerous ? 'bg-brick text-card' : 'bg-card text-muted hover:text-ink'}`}>Yes</button>
                </div>
              </div>
            )}
            {form.isDangerous && (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Class Number <span className="text-rust">*</span></label>
                  <input value={form.dangerousClass} onChange={setInput('dangerousClass')} className={`${inputCls} font-mono ${errors.dangerousClass ? 'border-brick' : 'border-ink/30'}`} placeholder="IMO class, e.g. 3" />
                  {errors.dangerousClass && <p className="mt-1 font-mono text-xs text-brick">{errors.dangerousClass}</p>}
                </div>
                {!hasQuotation && (
                  <div>
                    <label className={labelCls}>UN Number <span className="text-rust">*</span></label>
                    <input value={form.unNumber} onChange={setInput('unNumber')} className={`${inputCls} font-mono ${errors.unNumber ? 'border-brick' : 'border-ink/30'}`} placeholder="e.g. UN1203" />
                    {errors.unNumber && <p className="mt-1 font-mono text-xs text-brick">{errors.unNumber}</p>}
                  </div>
                )}
              </div>
            )}
            {form.isDangerous && (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-3" data-testid="dg-detail">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Proper Shipping Name <span className="text-rust">*</span></label>
                  <input aria-label="Proper shipping name" value={form.properShippingName} onChange={setInput('properShippingName')} className={`${inputCls} border-ink/30`} />
                </div>
                <div>
                  <label className={labelCls}>Subsidiary Risk</label>
                  <input aria-label="Subsidiary risk" value={form.subsidiaryRisk} onChange={setInput('subsidiaryRisk')} className={`${inputCls} border-ink/30 font-mono`} />
                </div>
                <Select label="Packing Group *" clearable placeholder="Select" options={PACKING_GROUP_OPTIONS} value={form.packingGroup} onChange={set('packingGroup')} />
                <div>
                  <label className={labelCls}>Flash Point (°C)</label>
                  <input type="number" aria-label="Flash point" value={form.flashPoint} onChange={setInput('flashPoint')} className={`${inputCls} border-ink/30 font-mono`} />
                </div>
                <div>
                  <label className={labelCls}>Emergency Contact <span className="text-rust">*</span></label>
                  <input aria-label="Emergency contact" value={form.emergencyContact} onChange={setInput('emergencyContact')} className={`${inputCls} border-ink/30`} />
                </div>
                <label className="flex items-center gap-2 text-sm text-ink sm:col-span-3">
                  <input type="checkbox" checked={form.marinePollutant} onChange={(e) => set('marinePollutant')(e.target.checked)} className="h-4 w-4" />
                  Marine pollutant
                </label>
              </div>
            )}
            {form.isDangerous && (
              <div>
                <span className={labelCls}>DG Attachments (MSDS{hasQuotation ? ', from the quotation' : ''})</span>
                {msdsFiles.length > 0 ? (
                  <ul className="divide-y divide-line border border-ink/25 bg-card text-sm">
                    {msdsFiles.map((f) => (
                      <li key={f._id} className="px-3 py-2">
                        <button type="button" onClick={() => downloadMsds(f)} className="truncate text-left text-rust hover:text-rust-dark">{f.fileName}</button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="font-mono text-xs text-muted">{hasQuotation ? 'The quotation has no MSDS files attached.' : 'MSDS files are attached on the quotation.'}</p>
                )}
              </div>
            )}
          </div>
        </fieldset>

        {/* Parties — Step 1 (master-data picks; required source info for the shipping declaration) */}
        <fieldset disabled={locked(1)} className={`${sectionCls} min-w-0 ${visible(STEP.parties) ? '' : 'hidden'}`}>
          <h2 className={sectionTitleCls}>Parties</h2>

          <div className="space-y-3">
            <p className={subTitleCls}>POD Agent</p>
            <Select
              clearable
              searchable
              label="POD Agent (POD AGENTS master data)"
              placeholder="Select POD agent"
              options={agents.map((a) => ({ value: a._id, label: a.country ? `${a.name} — ${a.country}` : a.name }))}
              value={form.podAgentRef}
              onChange={selectPodAgent}
            />
            <PartyDetails data={form.podAgent} />
          </div>

          <div className="border-t border-line pt-4">{renderParty('shipper', 'Shipper')}</div>
          <div className="border-t border-line pt-4">{renderParty('consignee', 'Consignee')}</div>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={form.notifySameAsConsignee} onChange={(e) => toggleNotifySame(e.target.checked)} className="h-4 w-4" />
            Notify is the same as the Consignee
          </label>

          {renderParty('notify', 'Notify', { disabled: form.notifySameAsConsignee })}

          <div className="grid grid-cols-1 gap-5 border-t border-line pt-4 sm:grid-cols-3">
            <ReadOnly label="Exporter Tax Number (shipper)">{form.exportTaxNumber}</ReadOnly>
            <ReadOnly label="Importer Tax Number (consignee)">{form.importTaxNumber}</ReadOnly>
            <ReadOnly label="Importer Country (consignee)">{form.importCountry}</ReadOnly>
          </div>
        </fieldset>

        {/* Carrier Booking Confirmation — Step 2 */}
        <fieldset disabled={locked(2)} className={`${sectionCls} min-w-0 ${visible(STEP.carrierBooking) ? '' : 'hidden'}`}>
          <h2 className={sectionTitleCls}>Carrier Booking Confirmation</h2>

          {isEdit && (
            <SummaryCard
              testId="job-summary"
              title="Job Summary (read-only)"
              items={[
                { label: 'Job No', value: booking.jobNo },
                { label: 'Shipper', value: form.shipper.name },
                { label: 'Consignee', value: form.consignee.name },
                { label: 'POL', value: portLabel(form.pol) },
                { label: 'POD', value: portLabel(form.pod) },
                { label: 'Commodity', value: form.commodity },
                { label: 'Gross weight', value: form.grossWeight !== '' ? `${form.grossWeight} kg` : '' },
                { label: 'CBM', value: form.cbm },
                { label: 'Carrier (container owner)', value: nvoccLabel },
                { label: 'Container types & quantity', value: equipmentText },
                { label: 'Dangerous goods', value: form.isDangerous ? `Yes — UN ${String(form.unNumber || '').replace(/^UN/i, '')}` : 'No' },
                { label: 'Cargo readiness / target ETD', value: `${form.cargoReadinessDate || '-'} / ${quotation?.targetEtd ? String(quotation.targetEtd).slice(0, 10) : '-'}` },
              ]}
            />
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Select label="Vessel Operator (VO)" searchable clearable placeholder="Select vessel operator" options={carrierOptions} value={form.carrier} onChange={changeVo} />
            <Select
              label="Vessel Name"
              searchable
              clearable
              placeholder={vesselOptions.length ? 'Select vessel' : 'No vessels for this VO'}
              options={vesselOptions}
              value={form.vesselName}
              onChange={changeVessel}
            />
            <div>
              <label className={labelCls}>Voyage No</label>
              <input value={form.voyageNo} onChange={setInput('voyageNo')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className={labelCls}>POL Terminal <span className="text-rust">*</span></label>
              <input aria-label="POL terminal" value={form.polTerminal} onChange={setInput('polTerminal')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>POD Terminal <span className="text-rust">*</span> <span className="normal-case text-muted/70">(TBA allowed)</span></label>
              <input aria-label="POD terminal" value={form.podTerminal} onChange={setInput('podTerminal')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Service / Loop Code</label>
              <input aria-label="Service code" value={form.serviceLoopCode} onChange={setInput('serviceLoopCode')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Vessel IMO</label>
              <input aria-label="Vessel IMO" value={form.vesselImo} onChange={setInput('vesselImo')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <span className={labelCls}>Booking Type</span>
              <p className="min-h-[42px] border border-ink/20 bg-paper/60 px-3.5 py-2.5 text-sm font-semibold text-ink" title="Shipper-owned containers — always SOC">SOC</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelCls}>ETD <span className="normal-case text-rust">· POL: {portLabel(form.pol) || '-'}</span></label>
              <input type="date" value={form.etd} onChange={setInput('etd')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <ReadOnly label="ATD (recorded in Step 5)">{form.atd}</ReadOnly>
            <div>
              <label className={labelCls}>ETA <span className="normal-case text-rust">· POD: {portLabel(form.pod) || '-'}</span></label>
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
            <Select
              label="VO Contact Person"
              searchable
              clearable
              disabled={!form.carrier}
              placeholder={!form.carrier ? 'Select a VO first' : voContactOptions.length ? 'Select contact' : 'No contacts on this VO'}
              options={voContactOptions}
              value={form.voContactPerson}
              onChange={set('voContactPerson')}
            />
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

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div>
              <label className={labelCls}>CY Opening (early gate-in)</label>
              <input type="datetime-local" aria-label="CY opening" value={form.cyOpeningCutoff} onChange={setInput('cyOpeningCutoff')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Customs Cut-off</label>
              <input type="datetime-local" aria-label="Customs cut-off" value={form.customsCutoff} onChange={setInput('customsCutoff')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            {form.isDangerous && (
              <div>
                <label className={labelCls}>DG Cut-off <span className="text-rust">*</span></label>
                <input type="datetime-local" aria-label="DG cut-off" value={form.dgCutoff} onChange={setInput('dgCutoff')} className={`${inputCls} border-ink/30 font-mono`} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Booking Request Sent</label>
              <input type="datetime-local" aria-label="Booking request sent" value={form.bookingRequestSentAt} onChange={setInput('bookingRequestSentAt')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>VO Free Time at POD (days)</label>
              <input type="number" min="0" aria-label="VO free time" value={form.voFreeTimeDays} onChange={setInput('voFreeTimeDays')} className={`${inputCls} border-ink/30 font-mono`} />
              {quotation?.freeTimeBuyingDays != null && <p className="mt-1 font-mono text-[10px] text-muted">Client was quoted {quotation.freeTimeBuyingDays} days</p>}
            </div>
            {form.isDangerous && (
              <div>
                <label className={labelCls}>DG Acceptance Ref <span className="text-rust">*</span></label>
                <input aria-label="DG acceptance ref" value={form.dgAcceptanceRef} onChange={setInput('dgAcceptanceRef')} className={`${inputCls} border-ink/30 font-mono`} />
              </div>
            )}
          </div>

          <div data-testid="confirmed-equipment">
            <label className={labelCls}>Confirmed Equipment <span className="text-rust">*</span> <span className="normal-case text-muted/70">(what the VO accepted — must cover the quantities required)</span></label>
            <div className="flex flex-wrap items-center gap-4">
              {containerRows.map((r) => (
                <label key={r.containerType} className="flex items-center gap-2 text-sm text-ink">
                  <span className="font-mono">{typeCode(r.containerType)}</span>
                  <input
                    type="number"
                    min="0"
                    aria-label={`Confirmed ${typeCode(r.containerType)}`}
                    value={form.confirmedEquipment[r.containerType] ?? ''}
                    onChange={(e) => set('confirmedEquipment')({ ...form.confirmedEquipment, [r.containerType]: e.target.value })}
                    className={`${inputCls} w-24 border-ink/30 font-mono`}
                  />
                  <span className="font-mono text-xs text-muted">of {r.quantity}</span>
                </label>
              ))}
              {containerRows.length > 0 && (
                <button
                  type="button"
                  onClick={() => set('confirmedEquipment')(Object.fromEntries(containerRows.map((r) => [r.containerType, r.quantity])))}
                  className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-rust transition-colors hover:text-rust-dark"
                >
                  Same as requested
                </button>
              )}
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
        </fieldset>

        {/* Commercial — Step 2 (view only for a job that came from a quotation) */}
        <fieldset disabled={locked(2)} className={`${sectionCls} min-w-0 ${visible(STEP.commercial) ? '' : 'hidden'}`}>
          <h2 className={sectionTitleCls}>Commercial</h2>
          {hasQuotation ? (
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
                <ReadOnly label="Carrier">{nvoccs.find((n) => n._id === form.nvocc) ? `${nvoccs.find((n) => n._id === form.nvocc).code} — ${nvoccs.find((n) => n._id === form.nvocc).name}` : ''}</ReadOnly>
                <ReadOnly label="Currency">{form.currency}</ReadOnly>
                <ReadOnly label="Price">{form.price !== '' ? String(form.price) : ''}</ReadOnly>
                <ReadOnly label="Cost">{form.cost !== '' ? String(form.cost) : ''}</ReadOnly>
                <ReadOnly label="Free Time">{freeTimeShown}</ReadOnly>
              </div>
              <p className="font-mono text-xs text-muted">Commercial data comes from the quotation.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
              <Select label="Carrier" searchable placeholder="Select carrier" options={nvoccs.map((n) => ({ value: n._id, label: `${n.code} — ${n.name}` }))} value={form.nvocc} onChange={set('nvocc')} />
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
          )}
        </fieldset>

        {/* Containers — Step 3 (Depot / Container) */}
        <fieldset disabled={locked(3)} className={`${sectionCls} min-w-0 ${visible(STEP.containers) ? '' : 'hidden'}`}>
          <h2 className={sectionTitleCls}>Containers</h2>

          {isEdit && (
            <SummaryCard
              testId="requirement"
              title="Requirement (read-only)"
              items={[
                { label: 'Carrier (container owner)', value: nvoccLabel },
                { label: 'Container types & quantity required', value: equipmentText },
                { label: 'Vessel / voyage / ETD', value: `${form.vesselName || '-'} / ${form.voyageNo || '-'} / ${form.etd || '-'}` },
                { label: 'CY cut-off / VGM cut-off', value: `${form.cyGateInCutoff ? form.cyGateInCutoff.replace('T', ' ') : '-'} / ${form.vgmCutoff ? form.vgmCutoff.replace('T', ' ') : '-'}` },
                { label: 'Declared packages / gross / CBM', value: `${form.packagesCount || '-'} / ${form.grossWeight !== '' ? form.grossWeight + ' kg' : '-'} / ${form.cbm !== '' ? form.cbm : '-'}` },
                { label: 'Deliver full container to', value: form.polTerminal },
              ]}
            />
          )}

          <Select label="Depot" searchable placeholder="Select depot" options={depotOptions} value={form.depot} onChange={set('depot')} />
          <p className="font-mono text-xs text-muted">Required before this booking can be confirmed.</p>

          {/* Sprint 007 — Release Order (PRD S3-10 .. S3-16) */}
          <div className="space-y-5 border-t border-line pt-4" data-testid="release-order">
            <p className={subTitleCls}>Release Order (CRO)</p>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
              <div>
                <label className={labelCls}>CRO Number <span className="text-rust">*</span></label>
                <input aria-label="CRO number" value={form.croNumber} onChange={setInput('croNumber')} className={`${inputCls} border-ink/30 font-mono`} />
              </div>
              <div>
                <label className={labelCls}>CRO Issue Date <span className="text-rust">*</span></label>
                <input type="date" aria-label="CRO issue date" value={form.croIssueDate} onChange={setInput('croIssueDate')} className={`${inputCls} border-ink/30 font-mono`} />
              </div>
              <div>
                <label className={labelCls}>CRO Validity Date <span className="text-rust">*</span></label>
                <input type="date" aria-label="CRO validity date" value={form.croValidityDate} onChange={setInput('croValidityDate')} className={`${inputCls} border-ink/30 font-mono`} />
              </div>
              <Select label="CRO Issued By *" clearable placeholder="Select" options={CRO_ISSUER_OPTIONS} value={form.croIssuedBy} onChange={set('croIssuedBy')} />
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Released To (trucker / shipper)</label>
                <input aria-label="Released to" value={form.releasedTo} onChange={setInput('releasedTo')} className={`${inputCls} border-ink/30`} />
              </div>
              <div>
                <label className={labelCls}>Truck Plate &amp; Driver</label>
                <input aria-label="Truck plate and driver" value={form.truckPlateDriver} onChange={setInput('truckPlateDriver')} className={`${inputCls} border-ink/30`} />
              </div>
            </div>
          </div>

          {!isConfirmed && (
            <div>
              <label className={labelCls}>Containers — type, container number (auto from stock), seal</label>
              {containerRows.length === 0 ? (
                <p className="font-mono text-xs text-muted">No container types on this job yet.</p>
              ) : (
                <ContainerAutoRows
                  rows={containerRows}
                  slots={form.containerSlots}
                  onChange={set('containerSlots')}
                  depot={form.depot}
                  nvocc={form.nvocc}
                  containerTypes={containerTypes}
                  disabled={isLocked}
                />
              )}
              <p className="mt-1 font-mono text-xs text-muted">Container numbers are assigned automatically from the depot&apos;s oldest free stock and are reserved when the booking is confirmed.</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Gate In Date</label>
              <input type="date" value={form.gateInDate} onChange={setInput('gateInDate')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Gate Out Date</label>
              <input type="date" value={form.gateOutDate} onChange={setInput('gateOutDate')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>

          {isConfirmed && (
            <div className="space-y-3">
              <label className={labelCls}>Allocated Containers — Fulfillment</label>
              <ContainerGrid booking={booking} containerTypes={containerTypes} locked={locked(3)} canUpdate={canUpdate} onChanged={onJobChanged} />
              <ReconciliationPanel reconciliation={jobState?.reconciliation} />
              <div>
                <label className={labelCls}>Variance Reason <span className="normal-case text-muted/70">(only needed when a reconciliation check fails)</span></label>
                <input aria-label="Reconciliation reason" value={form.reconciliationReason} onChange={setInput('reconciliationReason')} className={`${inputCls} border-ink/30`} />
              </div>
            </div>
          )}
        </fieldset>

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
