'use client'

import { useState } from 'react'
import Select from '@/components/ui/Select'
import ContainerSelector from './ContainerSelector'
import ProfitabilitySummary from './ProfitabilitySummary'
import RateTable, { DEFAULT_LINE_CURRENCY } from './RateTable'
import MasterDataFormModal from '@/components/masterdata/MasterDataFormModal'
import * as masterDataApi from '@/services/masterData'
import * as quotationApi from '@/services/quotation'
import { computeProfitability, getContainerSize, getQtyBySize } from '@/utils/quotationCalc'
import { mirrorBuyingToSelling, newUid } from '@/utils/quotationSync'
import { CONTAINER_SIZES, ORIGIN_LINES, DESTINATION_LINES } from '@/constants/quotationRates'

// `d` is either a Date instance (e.g. `new Date()` for "default to today")
// or an ISO date string from the API — String(Date) is NOT yyyy-mm-dd
// (it's "Mon Sep 14 2026 ..."), so a plain Date must go through
// toISOString() first or the <input type="date"> silently renders empty.
const toDateInput = (d) => {
  if (!d) return ''
  return (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10)
}

const formatDateTime = (d) => (d ? new Date(d).toLocaleString() : '-')

// A rate table's form state: one { rate20, rate40, qty20, qty40 } per fixed
// line (kept as strings so an empty input stays empty) plus free-form lines.
const RATE_FIELDS = ['rate20', 'rate40', 'qty20', 'qty40']
const emptyLine = () => ({ ...Object.fromEntries(RATE_FIELDS.map((f) => [f, ''])), currency: DEFAULT_LINE_CURRENCY })

const emptyTable = (lines) => ({
  ...Object.fromEntries(lines.map(({ key }) => [key, emptyLine()])),
  custom: [],
  hidden: [],
})

// Every row has its own currency. A line saved before per-row currencies
// existed has none and inherits the quotation's old table currency.
const lineFromApi = (line, fallbackCurrency) => ({
  ...Object.fromEntries(RATE_FIELDS.map((f) => [f, line?.[f] ?? ''])),
  currency: line?.currency ?? fallbackCurrency ?? DEFAULT_LINE_CURRENCY,
})

const tableFromApi = (table, lines, fallbackCurrency) => ({
  ...Object.fromEntries(lines.map(({ key }) => [key, lineFromApi(table?.[key], fallbackCurrency)])),
  custom: (table?.custom || []).map((l) => ({ uid: l.uid || newUid(), label: l.label, ...lineFromApi(l, fallbackCurrency) })),
  hidden: table?.hidden || [],
})

const lineHasData = (line) => RATE_FIELDS.some((f) => line?.[f] !== '' && line?.[f] !== undefined)
const tableHasData = (table, lines) =>
  lines.some(({ key }) => lineHasData(table[key])) || (table.custom || []).some(lineHasData)

// Only fields of sizes actually present in the quotation are sent, so a size
// that was priced and then removed from Section 1 can't leave stale numbers
// (or a stale QTY override) behind.
const linePayload = (line, sizes) => {
  const out = {}
  sizes.forEach((size) => {
    ;[`rate${size}`, `qty${size}`].forEach((f) => {
      if (line[f] !== '' && line[f] !== undefined) out[f] = Number(line[f])
    })
  })
  if (Object.keys(out).length > 0) out.currency = line.currency ?? ''
  return out
}

const tablePayload = (table, lines, sizes) => {
  const out = {}
  lines.forEach(({ key }) => {
    const line = linePayload(table[key], sizes)
    if (Object.keys(line).length > 0) out[key] = line
  })
  out.custom = (table.custom || [])
    .filter((l) => l.label && l.label.trim())
    .map((l) => ({ uid: l.uid, label: l.label.trim(), currency: l.currency ?? '', ...linePayload(l, sizes) }))
  out.hidden = table.hidden || []
  return out
}

function emptyForm(currentUser) {
  return {
    quotationNo: '',
    customerType: 'existing',
    customer: '',
    clientName: '',
    contactPerson: '',
    contactPhone: '',
    contactEmail: '',
    clientReferenceNo: '',
    inquiryDate: toDateInput(new Date()),
    salesRep: currentUser?.name || currentUser?.email || '',
    commodity: '',
    hsCode: '',
    containers: [{ containerType: '', quantity: 1 }],
    grossWeight: '',
    cbm: '',
    isDangerous: false,
    unNumber: '',
    pol: '',
    pod: '',
    incoterms: '',
    targetEtd: '',
    targetRate: '',
    cargoReadinessDate: '',
    specialNotes: '',
    nvocc: '',
    rateValidFrom: '',
    rateValidTo: '',
    buyingOrigin: emptyTable(ORIGIN_LINES),
    buyingDestination: emptyTable(DESTINATION_LINES),
    freeTimeBuyingDays: '',
    rateSourceReference: '',
    sellingOrigin: emptyTable(ORIGIN_LINES),
    sellingDestination: emptyTable(DESTINATION_LINES),
    paymentTerms: '',
  }
}

function buildInitialForm(quotation, currentUser) {
  if (!quotation) return emptyForm(currentUser)
  return {
    quotationNo: quotation.quotationNo || '',
    customerType: quotation.customerType || 'existing',
    customer: quotation.customer?._id || quotation.customer || '',
    clientName: quotation.clientName || '',
    contactPerson: quotation.contactPerson || '',
    contactPhone: quotation.contactPhone || '',
    contactEmail: quotation.contactEmail || '',
    clientReferenceNo: quotation.clientReferenceNo || '',
    inquiryDate: toDateInput(quotation.inquiryDate) || toDateInput(new Date()),
    salesRep: quotation.salesRep || currentUser?.name || currentUser?.email || '',
    commodity: quotation.commodity || '',
    hsCode: quotation.hsCode || '',
    containers: (quotation.containers || []).map((c) => ({
      containerType: c.containerType?._id || c.containerType,
      quantity: c.quantity,
    })),
    grossWeight: quotation.grossWeight ?? '',
    cbm: quotation.cbm ?? '',
    isDangerous: !!quotation.isDangerous,
    unNumber: quotation.unNumber || '',
    pol: quotation.pol?._id || quotation.pol || '',
    pod: quotation.pod?._id || quotation.pod || '',
    incoterms: quotation.incoterms || '',
    targetEtd: toDateInput(quotation.targetEtd),
    targetRate: quotation.targetRate ?? '',
    cargoReadinessDate: toDateInput(quotation.cargoReadinessDate),
    specialNotes: quotation.specialNotes || '',
    nvocc: quotation.nvocc?._id || quotation.nvocc || '',
    rateValidFrom: toDateInput(quotation.rateValidFrom),
    rateValidTo: toDateInput(quotation.rateValidTo),
    buyingOrigin: tableFromApi(quotation.buyingOrigin, ORIGIN_LINES, quotation.buyingCurrency),
    buyingDestination: tableFromApi(quotation.buyingDestination, DESTINATION_LINES, quotation.buyingDestinationCurrency || quotation.buyingCurrency),
    freeTimeBuyingDays: quotation.freeTimeBuyingDays ?? '',
    rateSourceReference: quotation.rateSourceReference || '',
    sellingOrigin: tableFromApi(quotation.sellingOrigin, ORIGIN_LINES, quotation.sellingCurrency),
    sellingDestination: tableFromApi(quotation.sellingDestination, DESTINATION_LINES, quotation.sellingDestinationCurrency || quotation.sellingCurrency),
    paymentTerms: quotation.paymentTerms || '',
  }
}

const labelCls = 'mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted'
const inputCls = 'w-full border bg-card px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust'
const sectionCls = 'space-y-5 border border-ink/25 bg-card p-5 sm:p-6'
const sectionTitleCls = 'font-display text-base font-bold uppercase tracking-wide text-ink'

const INCOTERMS = ['EXW', 'FCA', 'FOB', 'CPT', 'CIP', 'CFR', 'CIF', 'DAP', 'DPU', 'DDP']
const PAYMENT_TERMS = ['Freight Prepaid', 'Freight Collect']

const LOCKED_STATUSES = ['sent', 'approved', 'rejected']

export default function QuotationForm({
  quotation = null,
  customers = [],
  ports = [],
  containerTypes = [],
  nvoccs = [],
  currentUser = null,
  teamMembers = [],
  submitting = false,
  canOverrideLock = false,
  onSubmit,
  onCustomerCreated,
}) {
  const isEdit = !!quotation
  const isNormallyLocked = isEdit && LOCKED_STATUSES.includes(quotation.status)
  const isLocked = isNormallyLocked && !canOverrideLock
  const isOverriding = isNormallyLocked && canOverrideLock
  const [form, setForm] = useState(() => buildInitialForm(quotation, currentUser))
  const [errors, setErrors] = useState({})
  const [newClientOpen, setNewClientOpen] = useState(false)
  const [creatingCustomer, setCreatingCustomer] = useState(false)
  const [rateNote, setRateNote] = useState('')

  const set = (field) => (v) => setForm((f) => ({ ...f, [field]: v }))
  const setInput = (field) => (e) => set(field)(e.target.value)

  const portOptions = ports.map((p) => ({ value: p._id, label: `${p.code} — ${p.name}` }))
  const customerOptions = customers.map((c) => ({ value: c._id, label: c.name }))
  const nvoccOptions = nvoccs.map((n) => ({ value: n._id, label: `${n.code} — ${n.name}` }))
  const selectedCustomer = customers.find((c) => c._id === form.customer) || null

  // Sales rep: the logged-in user by default, any team member selectable. The
  // stored value stays a plain string (name, else email); a legacy free-text
  // value on an old quotation is kept selectable instead of being blanked.
  const salesRepOptions = (() => {
    const seen = new Set()
    const out = []
    const add = (value, label) => {
      if (!value || seen.has(value)) return
      seen.add(value)
      out.push({ value, label: label || value })
    }
    const labelFor = (m) => (m?.name && m?.email ? `${m.name} (${m.email})` : undefined)
    add(currentUser?.name || currentUser?.email, labelFor(currentUser))
    teamMembers.forEach((m) => add(m.name || m.email, labelFor(m)))
    add(form.salesRep)
    return out
  })()

  // Contact person: a dropdown of the selected client's contact rows (name +
  // phone). The stored value stays the contact's name.
  const customerContacts = selectedCustomer?.contacts || []
  const contactOptions = customerContacts.map((c) => ({
    value: c._id,
    label: c.phone ? `${c.name} — ${c.phone}` : c.name,
  }))
  const matchedContact =
    customerContacts.find((c) => c.name === form.contactPerson && (!form.contactPhone || !c.phone || c.phone === form.contactPhone)) ||
    customerContacts.find((c) => c.name === form.contactPerson)
  // An old quotation's free-text contact that isn't one of the client's rows.
  if (form.contactPerson && !matchedContact) contactOptions.unshift({ value: '__current', label: form.contactPerson })
  const contactValue = matchedContact?._id || (form.contactPerson ? '__current' : '')
  const handleSelectContact = (id) => {
    if (id === '__current') return
    const c = customerContacts.find((x) => x._id === id)
    setForm((f) => ({
      ...f,
      contactPerson: c?.name || '',
      contactPhone: c?.phone || selectedCustomer?.phone || '',
      contactEmail: c?.email || selectedCustomer?.email || '',
    }))
  }
  const selectedNvocc = nvoccs.find((n) => n._id === form.nvocc) || null

  // The rate tables' 20ft / 40ft columns follow the containers picked in
  // Section 1: a size only gets columns while at least one container of it is
  // selected, and each line's QTY defaults to that size's total quantity.
  const qtyBySize = getQtyBySize(form.containers, containerTypes)
  const sizes = CONTAINER_SIZES.filter((s) => qtyBySize[s] > 0)
  const unsizedCodes = [...new Set(form.containers.map((c) => c.containerType).filter(Boolean))]
    .map((id) => containerTypes.find((t) => t._id === id))
    .filter((t) => t && getContainerSize(t.code) === null)
    .map((t) => t.code)

  const totals = computeProfitability({
    qtyBySize,
    buying: { origin: form.buyingOrigin, destination: form.buyingDestination },
    selling: { origin: form.sellingOrigin, destination: form.sellingDestination },
  })

  // Buying -> Selling only: any change to a Buying table (a value, a currency,
  // a label, a new row, a restored row) is mirrored onto the matching Selling
  // table. Editing a Selling table never touches Buying.
  const handleBuyingTable = (kind, lines) => (next) =>
    setForm((f) => ({
      ...f,
      [`buying${kind}`]: next,
      [`selling${kind}`]: mirrorBuyingToSelling(f[`buying${kind}`], next, f[`selling${kind}`], lines),
    }))

  const handleSelectCustomer = (id) => {
    const c = customers.find((x) => x._id === id)
    setForm((f) => ({
      ...f,
      customer: id,
      clientName: c?.name || '',
      contactPerson: '',
      contactPhone: c?.phone || '',
      contactEmail: c?.email || '',
    }))
  }

  const handleCreateCustomer = async (values) => {
    setCreatingCustomer(true)
    try {
      const created = await masterDataApi.createCustomer(values)
      setForm((f) => ({
        ...f,
        customer: created._id,
        clientName: created.name,
        contactPerson: '',
        contactPhone: created.phone || '',
        contactEmail: created.email || '',
      }))
      setNewClientOpen(false)
      onCustomerCreated?.(created)
    } finally {
      setCreatingCustomer(false)
    }
  }

  const handleNvoccChange = async (nvoccId) => {
    set('nvocc')(nvoccId)
    setRateNote('')
    if (!nvoccId) return
    const hasBuyingData =
      tableHasData(form.buyingOrigin, ORIGIN_LINES) || tableHasData(form.buyingDestination, DESTINATION_LINES) || form.rateSourceReference
    if (hasBuyingData) return
    try {
      const suggestion = await quotationApi.suggestRate(nvoccId, quotation?._id)
      if (!suggestion) return
      setForm((f) => ({
        ...f,
        buyingOrigin: tableFromApi(suggestion.buyingOrigin, ORIGIN_LINES, suggestion.buyingCurrency),
        buyingDestination: tableFromApi(suggestion.buyingDestination, DESTINATION_LINES, suggestion.buyingDestinationCurrency || suggestion.buyingCurrency),
        freeTimeBuyingDays: suggestion.freeTimeBuyingDays ?? '',
        rateSourceReference: suggestion.rateSourceReference || '',
      }))
      setRateNote(`Prefilled from the last quotation (${suggestion.quotationNo}) using this NVOCC — edit freely, some rates are Spot.`)
    } catch {
      // best-effort suggestion only — silently skip if the lookup fails
    }
  }

  const validate = () => {
    const next = {}
    if (!form.customer) next.customer = form.customerType === 'new' ? 'Create the new client first' : 'Select a client'
    if (!form.salesRep.trim()) next.salesRep = 'Sales representative is required'
    if (!form.commodity.trim()) next.commodity = 'Commodity is required'
    if (!form.pol) next.pol = 'Port of loading is required'
    if (!form.pod) next.pod = 'Port of discharge is required'
    if (form.isDangerous && !form.unNumber.trim()) next.unNumber = 'UN Number is required'
    const validContainers = form.containers.filter((c) => c.containerType && c.quantity >= 1)
    if (validContainers.length === 0) next.containers = 'Add at least one container entry'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!validate()) return

    const containers = form.containers.filter((c) => c.containerType && c.quantity >= 1)

    const payload = {
      customerType: form.customerType,
      customer: form.customer,
      clientName: form.clientName.trim(),
      contactPerson: form.contactPerson.trim(),
      contactPhone: form.contactPhone.trim(),
      contactEmail: form.contactEmail.trim(),
      clientReferenceNo: form.clientReferenceNo.trim(),
      inquiryDate: form.inquiryDate,
      salesRep: form.salesRep.trim(),
      commodity: form.commodity.trim(),
      hsCode: form.hsCode.trim(),
      containers,
      grossWeight: form.grossWeight === '' ? undefined : Number(form.grossWeight),
      cbm: form.cbm === '' ? undefined : Number(form.cbm),
      isDangerous: form.isDangerous,
      unNumber: form.isDangerous ? form.unNumber.trim() : undefined,
      pol: form.pol,
      pod: form.pod,
      incoterms: form.incoterms || undefined,
      targetEtd: form.targetEtd || undefined,
      // null (not undefined) so clearing the input on edit really clears it
      targetRate: form.targetRate === '' ? null : Number(form.targetRate),
      cargoReadinessDate: form.cargoReadinessDate || null,
      specialNotes: form.specialNotes.trim(),
      nvocc: form.nvocc || undefined,
      rateValidFrom: form.rateValidFrom || undefined,
      rateValidTo: form.rateValidTo || undefined,
      buyingOrigin: tablePayload(form.buyingOrigin, ORIGIN_LINES, sizes),
      buyingDestination: tablePayload(form.buyingDestination, DESTINATION_LINES, sizes),
      freeTimeBuyingDays: form.freeTimeBuyingDays === '' ? undefined : Number(form.freeTimeBuyingDays),
      rateSourceReference: form.rateSourceReference.trim(),
      sellingOrigin: tablePayload(form.sellingOrigin, ORIGIN_LINES, sizes),
      sellingDestination: tablePayload(form.sellingDestination, DESTINATION_LINES, sizes),
      paymentTerms: form.paymentTerms || undefined,
    }

    onSubmit(payload)
  }

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-6">
      {isOverriding && (
        <div className="flex items-center gap-2 border border-signal/40 bg-signal/10 px-4 py-3 text-sm text-signal">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em]">Override active</span>
          <span>This quotation is {quotation.status} and normally locked — you can edit it because you hold the quotation:approve permission.</span>
        </div>
      )}
      {/* min-w-0: a <fieldset> defaults to min-width: min-content, which lets the
          wide rate tables stretch it (and the whole page) instead of scrolling
          inside their own overflow-x-auto wrapper on narrow screens. */}
      <fieldset disabled={isLocked} className="min-w-0 space-y-6">
        {isEdit && (
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 border border-ink/20 bg-paper/60 p-4 text-sm sm:grid-cols-3">
            <div>
              <span className={labelCls}>Created At</span>
              <p className="font-mono text-ink">{formatDateTime(quotation.createdAt)}</p>
            </div>
            <div>
              <span className={labelCls}>Last Updated</span>
              <p className="font-mono text-ink">{formatDateTime(quotation.updatedAt)}</p>
            </div>
            <div>
              <span className={labelCls}>Updated By</span>
              <p className="text-ink">
                {quotation.updatedBy?.name || '-'}
                {quotation.updatedBy?.email && <span className="text-muted"> ({quotation.updatedBy.email})</span>}
              </p>
            </div>
          </div>
        )}

        {/* 1. Client Request */}
        <div className={sectionCls}>
          <h2 className={sectionTitleCls}>1. Client Request Data</h2>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Quotation No <span className="normal-case text-muted/70">(auto-generated)</span></label>
              <input
                value={form.quotationNo}
                disabled
                placeholder="Assigned on save (FQ260001)"
                className={`${inputCls} cursor-not-allowed border-ink/30 bg-paper font-mono text-muted`}
              />
            </div>
            <div>
              <label className={labelCls}>Inquiry Date</label>
              <input type="date" value={form.inquiryDate} onChange={setInput('inquiryDate')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>

          <Select
            clearable
            label="Sales Representative"
            required
            searchable
            placeholder="Select sales representative"
            options={salesRepOptions}
            value={form.salesRep}
            onChange={set('salesRep')}
            error={errors.salesRep}
          />

          <div>
            <label className={labelCls}>
              Client Type <span className="text-rust">*</span>
            </label>
            <div className="flex border border-ink/30">
              {['existing', 'new'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, customerType: t, customer: '', clientName: '', contactPerson: '' }))}
                  className={`flex-1 py-2.5 text-sm font-semibold uppercase tracking-wide transition-colors ${
                    form.customerType === t ? 'bg-ink text-paper' : 'bg-card text-muted hover:text-ink'
                  } ${t === 'new' ? 'border-l border-ink/30' : ''}`}
                >
                  {t === 'existing' ? 'Existing Client' : 'New Client'}
                </button>
              ))}
            </div>
          </div>

          {form.customerType === 'existing' ? (
            <div>
              <Select
            clearable
                label="Client Name / Company"
                required
                searchable
                placeholder="Select client"
                options={customerOptions}
                value={form.customer}
                onChange={handleSelectCustomer}
                error={errors.customer}
              />
            </div>
          ) : (
            <div>
              <label className={labelCls}>
                Client Name / Company <span className="text-rust">*</span>
              </label>
              {form.customer ? (
                <div className="flex items-center justify-between border border-ink/30 bg-paper/60 px-3.5 py-2.5 text-sm">
                  <span className="text-ink">{form.clientName} <span className="text-muted">(new client)</span></span>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, customer: '', clientName: '', contactPerson: '' }))}
                    className="font-mono text-[10px] uppercase tracking-wide text-rust hover:text-rust-dark"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setNewClientOpen(true)}
                  className="w-full border border-dashed border-ink/35 bg-paper/60 px-3.5 py-2.5 text-sm text-muted transition-colors hover:border-ink/55 hover:text-ink"
                >
                  + Create new client
                </button>
              )}
              {errors.customer && <p className="mt-1 font-mono text-xs text-brick">{errors.customer}</p>}
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Select
            clearable
              label="Contact Person"
              searchable
              disabled={!selectedCustomer}
              placeholder={!selectedCustomer ? 'Select a client first' : contactOptions.length ? 'Select contact' : 'No contacts on this client'}
              options={contactOptions}
              value={contactValue}
              onChange={handleSelectContact}
            />
            <div>
              <label className={labelCls}>Contact Phone</label>
              <input value={form.contactPhone} onChange={setInput('contactPhone')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Contact Email</label>
              <input type="email" value={form.contactEmail} onChange={setInput('contactEmail')} className={`${inputCls} border-ink/30`} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Client Reference No</label>
              <input value={form.clientReferenceNo} onChange={setInput('clientReferenceNo')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>
        </div>

        {/* 2. Ports */}
        <div className={sectionCls}>
          <h2 className={sectionTitleCls}>2. Ports</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Select clearable label="POL" required placeholder="Port of Loading" searchable options={portOptions} value={form.pol} onChange={set('pol')} error={errors.pol} />
            <Select clearable label="POD" required placeholder="Port of Discharge" searchable options={portOptions} value={form.pod} onChange={set('pod')} error={errors.pod} />
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Select clearable label="Incoterms" placeholder="Select incoterms" options={INCOTERMS.map((v) => ({ value: v, label: v }))} value={form.incoterms} onChange={set('incoterms')} />
            <div>
              <label className={labelCls}>Target / Required ETD</label>
              <input type="date" value={form.targetEtd} onChange={setInput('targetEtd')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>
        </div>

        {/* 3. Containers & Cargo */}
        <div className={sectionCls}>
          <h2 className={sectionTitleCls}>3. Containers & Cargo</h2>
          <div>
            <label className={labelCls}>Container Type & Quantity <span className="text-rust">*</span></label>
            <ContainerSelector clearable containerTypes={containerTypes} showStock={false} value={form.containers} onChange={set('containers')} />
            {errors.containers && <p className="mt-1 font-mono text-xs text-brick">{errors.containers}</p>}
          </div>


          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelCls}>Commodity <span className="text-rust">*</span></label>
              <input
                value={form.commodity}
                onChange={setInput('commodity')}
                className={`${inputCls} ${errors.commodity ? 'border-brick' : 'border-ink/30'}`}
                placeholder="e.g. Frozen poultry"
              />
              {errors.commodity && <p className="mt-1 font-mono text-xs text-brick">{errors.commodity}</p>}
            </div>
            <div>
              <label className={labelCls}>HS Code (preliminary)</label>
              <input value={form.hsCode} onChange={setInput('hsCode')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Gross Weight (kg, estimated)</label>
              <input type="number" min="0" value={form.grossWeight} onChange={setInput('grossWeight')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>CBM (estimated)</label>
              <input type="number" min="0" value={form.cbm} onChange={setInput('cbm')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Dangerous Goods</label>
            <div className="flex border border-ink/30">
              <button type="button" onClick={() => set('isDangerous')(false)} className={`flex-1 py-2.5 text-sm font-semibold uppercase tracking-wide transition-colors ${!form.isDangerous ? 'bg-ink text-paper' : 'bg-card text-muted hover:text-ink'}`}>No</button>
              <button type="button" onClick={() => set('isDangerous')(true)} className={`flex-1 border-l border-ink/30 py-2.5 text-sm font-semibold uppercase tracking-wide transition-colors ${form.isDangerous ? 'bg-brick text-card' : 'bg-card text-muted hover:text-ink'}`}>Yes</button>
            </div>
          </div>
          {form.isDangerous && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className={labelCls}>UN Number <span className="text-rust">*</span></label>
                <input value={form.unNumber} onChange={setInput('unNumber')} className={`${inputCls} font-mono ${errors.unNumber ? 'border-brick' : 'border-ink/30'}`} />
                {errors.unNumber && <p className="mt-1 font-mono text-xs text-brick">{errors.unNumber}</p>}
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>Special Notes <span className="normal-case text-muted/70">(reefer temp, open top, flat rack, etc.)</span></label>
            <textarea value={form.specialNotes} onChange={setInput('specialNotes')} rows={2} className={`${inputCls} border-ink/30`} />
          </div>
        </div>

        {/* 4. Rate Request */}
        <div className={sectionCls}>
          <h2 className={sectionTitleCls}>4. Rate Request</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Target Rate</label>
              <input type="number" min="0" step="any" value={form.targetRate} onChange={setInput('targetRate')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Cargo Readiness Date</label>
              <input type="date" value={form.cargoReadinessDate} onChange={setInput('cargoReadinessDate')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>
        </div>

        {/* 5. NVOCC */}
        <div className={sectionCls}>
          <h2 className={sectionTitleCls}>5. NVOCC (Master Data)</h2>
          <Select clearable label="Select NVOCC" placeholder="Choose an NVOCC" searchable options={nvoccOptions} value={form.nvocc} onChange={handleNvoccChange} />
          {rateNote && <p className="font-mono text-xs text-signal">{rateNote}</p>}
          {selectedNvocc && (
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 border border-ink/20 bg-paper/60 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <span className={labelCls}>Name</span>
                <p className="text-sm text-ink">{selectedNvocc.name}</p>
              </div>
              <div>
                <span className={labelCls}>Code</span>
                <p className="font-mono text-sm text-ink">{selectedNvocc.code}</p>
              </div>
              <div>
                <span className={labelCls}>Contract Type</span>
                <p className="text-sm text-ink">{selectedNvocc.contractType || '-'}</p>
              </div>
              <div>
                <span className={labelCls}>Contract Valid From</span>
                <p className="font-mono text-sm text-ink">{selectedNvocc.contractValidFrom ? new Date(selectedNvocc.contractValidFrom).toLocaleDateString() : '-'}</p>
              </div>
              <div>
                <span className={labelCls}>Contract Valid To</span>
                <p className="font-mono text-sm text-ink">{selectedNvocc.contractValidTo ? new Date(selectedNvocc.contractValidTo).toLocaleDateString() : '-'}</p>
              </div>
              <div>
                <span className={labelCls}>Trade Lane</span>
                <p className="text-sm text-ink">{selectedNvocc.tradeLane || '-'}</p>
              </div>
              <div>
                <span className={labelCls}>Address</span>
                <p className="text-sm text-ink">{selectedNvocc.address || '-'}</p>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <span className={labelCls}>Contacts</span>
                {selectedNvocc.contacts?.length ? (
                  <ul className="space-y-0.5 text-sm text-ink">
                    {selectedNvocc.contacts.map((c) => (
                      <li key={c._id}>
                        {c.name}
                        {c.title ? ` (${c.title})` : ''}
                        {c.email ? ` · ${c.email}` : ''}
                        {c.phone ? ` · ${c.phone}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink">-</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 6. Buying */}
        <div className={sectionCls}>
          <h2 className={sectionTitleCls}>6. Buying Rate</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Rate Valid From</label>
              <input type="date" value={form.rateValidFrom} onChange={setInput('rateValidFrom')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Rate Valid To</label>
              <input type="date" value={form.rateValidTo} onChange={setInput('rateValidTo')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>

          {unsizedCodes.length > 0 && (
            <p className="font-mono text-xs text-signal">
              {unsizedCodes.join(', ')} {unsizedCodes.length > 1 ? 'have' : 'has'} no 20ft / 40ft size, so {unsizedCodes.length > 1 ? 'they are' : 'it is'} not priced in the rate tables below.
            </p>
          )}

          <RateTable
            title="Origin Charges — Buying Rate"
            lines={ORIGIN_LINES}
            value={form.buyingOrigin}
            onChange={handleBuyingTable('Origin', ORIGIN_LINES)}
            sizes={sizes}
            qtyBySize={qtyBySize}
          />

          <RateTable
            title="Destination Charges — Buying Rate"
            lines={DESTINATION_LINES}
            value={form.buyingDestination}
            onChange={handleBuyingTable('Destination', DESTINATION_LINES)}
            sizes={sizes}
            qtyBySize={qtyBySize}
          />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Free Time Buying (days)</label>
              <input type="number" min="0" value={form.freeTimeBuyingDays} onChange={setInput('freeTimeBuyingDays')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Rate Source Reference</label>
              <input value={form.rateSourceReference} onChange={setInput('rateSourceReference')} className={`${inputCls} border-ink/30`} placeholder="Email / contract ref." />
            </div>
          </div>
        </div>

        {/* 7. Selling */}
        <div className={sectionCls}>
          <h2 className={sectionTitleCls}>7. Selling Price to Client</h2>
          <RateTable
            title="Origin Charges — Selling Rate"
            lines={ORIGIN_LINES}
            value={form.sellingOrigin}
            onChange={set('sellingOrigin')}
            sizes={sizes}
            qtyBySize={qtyBySize}
          />

          <RateTable
            title="Destination Charges — Selling Rate"
            lines={DESTINATION_LINES}
            value={form.sellingDestination}
            onChange={set('sellingDestination')}
            sizes={sizes}
            qtyBySize={qtyBySize}
          />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Select clearable label="Payment Terms" placeholder="Select payment terms" options={PAYMENT_TERMS.map((v) => ({ value: v, label: v }))} value={form.paymentTerms} onChange={set('paymentTerms')} />
          </div>
        </div>

        {/* 8. Profitability */}
        <div className={sectionCls}>
          <h2 className={sectionTitleCls}>8. Profitability</h2>
          <ProfitabilitySummary totals={totals} />
        </div>
      </fieldset>

      {!isLocked && (
        <div className="flex justify-end border-t border-line pt-5">
          <button type="submit" disabled={submitting} className="bg-rust px-6 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-rust-dark disabled:opacity-50">
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create quotation'}
          </button>
        </div>
      )}

    </form>
    <MasterDataFormModal
      isOpen={newClientOpen}
      onClose={() => setNewClientOpen(false)}
      onSave={handleCreateCustomer}
      item={null}
      fields={masterDataApi.CUSTOMER_FORM_FIELDS}
      title="New Client"
      saving={creatingCustomer}
    />
    </>
  )
}
