'use client'

import { useState } from 'react'
import Select from '@/components/ui/Select'
import ContainerSelector from './ContainerSelector'
import ProfitabilitySummary from './ProfitabilitySummary'
import RateTable from './RateTable'
import MasterDataFormModal from '@/components/masterdata/MasterDataFormModal'
import * as masterDataApi from '@/services/masterData'
import * as quotationApi from '@/services/quotation'
import { computeProfitability, getContainerSize, getQtyBySize } from '@/utils/quotationCalc'
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
const emptyLine = () => Object.fromEntries(RATE_FIELDS.map((f) => [f, '']))

const emptyTable = (lines) => ({
  ...Object.fromEntries(lines.map(({ key }) => [key, emptyLine()])),
  custom: [],
})

const lineFromApi = (line) => Object.fromEntries(RATE_FIELDS.map((f) => [f, line?.[f] ?? '']))

const tableFromApi = (table, lines) => ({
  ...Object.fromEntries(lines.map(({ key }) => [key, lineFromApi(table?.[key])])),
  custom: (table?.custom || []).map((l) => ({ label: l.label, ...lineFromApi(l) })),
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
    .map((l) => ({ label: l.label.trim(), ...linePayload(l, sizes) }))
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
    unClass: '',
    unNumber: '',
    por: '',
    pol: '',
    pod: '',
    fpd: '',
    incoterms: '',
    targetEtd: '',
    specialNotes: '',
    nvocc: '',
    buyingCurrency: 'USD',
    rateValidFrom: '',
    rateValidTo: '',
    buyingOrigin: emptyTable(ORIGIN_LINES),
    buyingDestinationCurrency: 'USD',
    buyingDestinationRate: 1,
    buyingDestination: emptyTable(DESTINATION_LINES),
    freeTimeBuyingDays: '',
    rateSourceReference: '',
    sellingCurrency: 'USD',
    exchangeRate: 1,
    sellingOrigin: emptyTable(ORIGIN_LINES),
    sellingDestinationCurrency: 'USD',
    sellingDestinationRate: 1,
    sellingDestination: emptyTable(DESTINATION_LINES),
    paymentTerms: '',
    validUntil: '',
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
    unClass: quotation.unClass || '',
    unNumber: quotation.unNumber || '',
    por: quotation.por?._id || quotation.por || '',
    pol: quotation.pol?._id || quotation.pol || '',
    pod: quotation.pod?._id || quotation.pod || '',
    fpd: quotation.fpd?._id || quotation.fpd || '',
    incoterms: quotation.incoterms || '',
    targetEtd: toDateInput(quotation.targetEtd),
    specialNotes: quotation.specialNotes || '',
    nvocc: quotation.nvocc?._id || quotation.nvocc || '',
    buyingCurrency: quotation.buyingCurrency || 'USD',
    rateValidFrom: toDateInput(quotation.rateValidFrom),
    rateValidTo: toDateInput(quotation.rateValidTo),
    buyingOrigin: tableFromApi(quotation.buyingOrigin, ORIGIN_LINES),
    buyingDestinationCurrency: quotation.buyingDestinationCurrency || quotation.buyingCurrency || 'USD',
    buyingDestinationRate: quotation.buyingDestinationRate ?? 1,
    buyingDestination: tableFromApi(quotation.buyingDestination, DESTINATION_LINES),
    freeTimeBuyingDays: quotation.freeTimeBuyingDays ?? '',
    rateSourceReference: quotation.rateSourceReference || '',
    sellingCurrency: quotation.sellingCurrency || 'USD',
    exchangeRate: quotation.exchangeRate ?? 1,
    sellingOrigin: tableFromApi(quotation.sellingOrigin, ORIGIN_LINES),
    sellingDestinationCurrency: quotation.sellingDestinationCurrency || quotation.sellingCurrency || 'USD',
    sellingDestinationRate: quotation.sellingDestinationRate ?? 1,
    sellingDestination: tableFromApi(quotation.sellingDestination, DESTINATION_LINES),
    paymentTerms: quotation.paymentTerms || '',
    validUntil: toDateInput(quotation.validUntil),
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
    buying: {
      origin: form.buyingOrigin,
      destination: form.buyingDestination,
      currency: form.buyingCurrency,
      destinationCurrency: form.buyingDestinationCurrency,
      destinationRate: form.buyingDestinationRate,
    },
    selling: {
      origin: form.sellingOrigin,
      destination: form.sellingDestination,
      currency: form.sellingCurrency,
      destinationCurrency: form.sellingDestinationCurrency,
      destinationRate: form.sellingDestinationRate,
    },
    exchangeRate: form.exchangeRate,
  })

  // Changing a side's Origin (base) currency drags its Destination currency
  // along while the two are still the same, so switching the whole side to
  // e.g. EGP doesn't suddenly demand a conversion rate for the other table.
  const handleBaseCurrencyChange = (side) => (currency) =>
    setForm((f) => ({
      ...f,
      [`${side}Currency`]: currency,
      [`${side}DestinationCurrency`]: f[`${side}DestinationCurrency`] === f[`${side}Currency`] ? currency : f[`${side}DestinationCurrency`],
    }))

  const handleSelectCustomer = (id) => {
    const c = customers.find((x) => x._id === id)
    setForm((f) => ({
      ...f,
      customer: id,
      clientName: c?.name || '',
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
        buyingCurrency: suggestion.buyingCurrency || f.buyingCurrency,
        buyingOrigin: tableFromApi(suggestion.buyingOrigin, ORIGIN_LINES),
        buyingDestinationCurrency: suggestion.buyingDestinationCurrency || suggestion.buyingCurrency || f.buyingDestinationCurrency,
        buyingDestinationRate: suggestion.buyingDestinationRate ?? 1,
        buyingDestination: tableFromApi(suggestion.buyingDestination, DESTINATION_LINES),
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
    if (!form.quotationNo.trim()) next.quotationNo = 'Quotation number is required'
    if (!form.customer) next.customer = form.customerType === 'new' ? 'Create the new client first' : 'Select a client'
    if (!form.salesRep.trim()) next.salesRep = 'Sales representative is required'
    if (!form.commodity.trim()) next.commodity = 'Commodity is required'
    if (!form.pol) next.pol = 'Port of loading is required'
    if (!form.pod) next.pod = 'Port of discharge is required'
    if (form.isDangerous && !form.unClass.trim()) next.unClass = 'UN Class is required'
    if (form.isDangerous && !form.unNumber.trim()) next.unNumber = 'UN Number is required'
    const validContainers = form.containers.filter((c) => c.containerType && c.quantity >= 1)
    if (validContainers.length === 0) next.containers = 'Add at least one container entry'
    // A Destination table in a different currency than its Origin table needs
    // a conversion rate, or its total can't be added into the side's total.
    ;['buying', 'selling'].forEach((side) => {
      const differs = form[`${side}DestinationCurrency`] !== form[`${side}Currency`]
      if (differs && !(Number(form[`${side}DestinationRate`]) > 0)) {
        next[`${side}DestinationRate`] = 'Enter the exchange rate into the origin currency'
      }
    })
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!validate()) return

    const containers = form.containers.filter((c) => c.containerType && c.quantity >= 1)

    const payload = {
      quotationNo: form.quotationNo.trim(),
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
      unClass: form.isDangerous ? form.unClass.trim() : undefined,
      unNumber: form.isDangerous ? form.unNumber.trim() : undefined,
      por: form.por || undefined,
      pol: form.pol,
      pod: form.pod,
      fpd: form.fpd || undefined,
      incoterms: form.incoterms || undefined,
      targetEtd: form.targetEtd || undefined,
      specialNotes: form.specialNotes.trim(),
      nvocc: form.nvocc || undefined,
      buyingCurrency: form.buyingCurrency,
      rateValidFrom: form.rateValidFrom || undefined,
      rateValidTo: form.rateValidTo || undefined,
      buyingOrigin: tablePayload(form.buyingOrigin, ORIGIN_LINES, sizes),
      buyingDestinationCurrency: form.buyingDestinationCurrency,
      buyingDestinationRate: form.buyingDestinationRate === '' ? 1 : Number(form.buyingDestinationRate),
      buyingDestination: tablePayload(form.buyingDestination, DESTINATION_LINES, sizes),
      freeTimeBuyingDays: form.freeTimeBuyingDays === '' ? undefined : Number(form.freeTimeBuyingDays),
      rateSourceReference: form.rateSourceReference.trim(),
      sellingCurrency: form.sellingCurrency,
      exchangeRate: form.exchangeRate === '' ? 1 : Number(form.exchangeRate),
      sellingOrigin: tablePayload(form.sellingOrigin, ORIGIN_LINES, sizes),
      sellingDestinationCurrency: form.sellingDestinationCurrency,
      sellingDestinationRate: form.sellingDestinationRate === '' ? 1 : Number(form.sellingDestinationRate),
      sellingDestination: tablePayload(form.sellingDestination, DESTINATION_LINES, sizes),
      paymentTerms: form.paymentTerms || undefined,
      validUntil: form.validUntil || undefined,
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
              <label className={labelCls}>
                Quotation No {isEdit ? <span className="normal-case text-muted/70">(cannot be changed)</span> : <span className="text-rust">*</span>}
              </label>
              <input
                value={form.quotationNo}
                onChange={setInput('quotationNo')}
                disabled={isEdit}
                className={`${inputCls} font-mono ${errors.quotationNo ? 'border-brick' : 'border-ink/30'} ${isEdit ? 'cursor-not-allowed bg-paper text-muted' : ''}`}
                placeholder="QT-2026-0001"
              />
              {errors.quotationNo && <p className="mt-1 font-mono text-xs text-brick">{errors.quotationNo}</p>}
            </div>
            <div>
              <label className={labelCls}>Inquiry Date</label>
              <input type="date" value={form.inquiryDate} onChange={setInput('inquiryDate')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>

          <div>
            <label className={labelCls}>
              Client Type <span className="text-rust">*</span>
            </label>
            <div className="flex border border-ink/30">
              {['existing', 'new'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, customerType: t, customer: '', clientName: '' }))}
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
                    onClick={() => setForm((f) => ({ ...f, customer: '', clientName: '' }))}
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
            <div>
              <label className={labelCls}>Contact Person</label>
              <input value={form.contactPerson} onChange={setInput('contactPerson')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Contact Phone</label>
              <input value={form.contactPhone} onChange={setInput('contactPhone')} className={`${inputCls} border-ink/30`} />
            </div>
            <div>
              <label className={labelCls}>Contact Email</label>
              <input type="email" value={form.contactEmail} onChange={setInput('contactEmail')} className={`${inputCls} border-ink/30`} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Client Reference No</label>
              <input value={form.clientReferenceNo} onChange={setInput('clientReferenceNo')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Sales Representative <span className="text-rust">*</span></label>
              <input value={form.salesRep} onChange={setInput('salesRep')} className={`${inputCls} ${errors.salesRep ? 'border-brick' : 'border-ink/30'}`} placeholder="Sales rep name" />
              {errors.salesRep && <p className="mt-1 font-mono text-xs text-brick">{errors.salesRep}</p>}
            </div>
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
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
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
            <label className={labelCls}>Container Type & Quantity <span className="text-rust">*</span></label>
            <ContainerSelector containerTypes={containerTypes} showStock={false} value={form.containers} onChange={set('containers')} />
            {errors.containers && <p className="mt-1 font-mono text-xs text-brick">{errors.containers}</p>}
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
                <label className={labelCls}>UN Class <span className="text-rust">*</span></label>
                <input value={form.unClass} onChange={setInput('unClass')} className={`${inputCls} font-mono ${errors.unClass ? 'border-brick' : 'border-ink/30'}`} />
                {errors.unClass && <p className="mt-1 font-mono text-xs text-brick">{errors.unClass}</p>}
              </div>
              <div>
                <label className={labelCls}>UN Number <span className="text-rust">*</span></label>
                <input value={form.unNumber} onChange={setInput('unNumber')} className={`${inputCls} font-mono ${errors.unNumber ? 'border-brick' : 'border-ink/30'}`} />
                {errors.unNumber && <p className="mt-1 font-mono text-xs text-brick">{errors.unNumber}</p>}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Select label="POR" placeholder="Place of Receipt" searchable options={portOptions} value={form.por} onChange={set('por')} />
            <Select label="POL" required placeholder="Port of Loading" searchable options={portOptions} value={form.pol} onChange={set('pol')} error={errors.pol} />
            <Select label="POD" required placeholder="Port of Discharge" searchable options={portOptions} value={form.pod} onChange={set('pod')} error={errors.pod} />
            <Select label="FPD" placeholder="Final Place of Delivery" searchable options={portOptions} value={form.fpd} onChange={set('fpd')} />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Select label="Incoterms" placeholder="Select incoterms" options={INCOTERMS.map((v) => ({ value: v, label: v }))} value={form.incoterms} onChange={set('incoterms')} />
            <div>
              <label className={labelCls}>Target / Required ETD</label>
              <input type="date" value={form.targetEtd} onChange={setInput('targetEtd')} className={`${inputCls} border-ink/30 font-mono`} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Special Notes <span className="normal-case text-muted/70">(reefer temp, open top, flat rack, etc.)</span></label>
            <textarea value={form.specialNotes} onChange={setInput('specialNotes')} rows={2} className={`${inputCls} border-ink/30`} />
          </div>
        </div>

        {/* 2. NVOCC */}
        <div className={sectionCls}>
          <h2 className={sectionTitleCls}>2. NVOCC (Master Data)</h2>
          <Select label="Select NVOCC" placeholder="Choose an NVOCC" searchable options={nvoccOptions} value={form.nvocc} onChange={handleNvoccChange} />
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
                <span className={labelCls}>Local Agent Name</span>
                <p className="text-sm text-ink">{selectedNvocc.localAgentName || '-'}</p>
              </div>
              <div>
                <span className={labelCls}>Local Agent Contact</span>
                <p className="text-sm text-ink">{selectedNvocc.localAgentContact || '-'}</p>
              </div>
            </div>
          )}
        </div>

        {/* 3. Buying */}
        <div className={sectionCls}>
          <h2 className={sectionTitleCls}>3. Buying Rate</h2>
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
            onChange={set('buyingOrigin')}
            sizes={sizes}
            qtyBySize={qtyBySize}
            currency={form.buyingCurrency}
            onCurrencyChange={handleBaseCurrencyChange('buying')}
          />

          <RateTable
            title="Destination Charges — Buying Rate"
            lines={DESTINATION_LINES}
            value={form.buyingDestination}
            onChange={set('buyingDestination')}
            sizes={sizes}
            qtyBySize={qtyBySize}
            currency={form.buyingDestinationCurrency}
            onCurrencyChange={set('buyingDestinationCurrency')}
            baseCurrency={form.buyingCurrency}
            conversionRate={form.buyingDestinationRate}
            onConversionRateChange={set('buyingDestinationRate')}
            conversionError={errors.buyingDestinationRate}
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

        {/* 4. Selling */}
        <div className={sectionCls}>
          <h2 className={sectionTitleCls}>4. Selling Price to Client</h2>
          <div>
            <label className={labelCls}>Exchange Rate <span className="normal-case text-muted/70">(buying → selling currency, used for profit)</span></label>
            <input type="number" min="0" step="0.0001" value={form.exchangeRate} onChange={setInput('exchangeRate')} className={`${inputCls} border-ink/30 font-mono sm:w-64`} />
          </div>

          <RateTable
            title="Origin Charges — Selling Rate"
            lines={ORIGIN_LINES}
            value={form.sellingOrigin}
            onChange={set('sellingOrigin')}
            sizes={sizes}
            qtyBySize={qtyBySize}
            currency={form.sellingCurrency}
            onCurrencyChange={handleBaseCurrencyChange('selling')}
          />

          <RateTable
            title="Destination Charges — Selling Rate"
            lines={DESTINATION_LINES}
            value={form.sellingDestination}
            onChange={set('sellingDestination')}
            sizes={sizes}
            qtyBySize={qtyBySize}
            currency={form.sellingDestinationCurrency}
            onCurrencyChange={set('sellingDestinationCurrency')}
            baseCurrency={form.sellingCurrency}
            conversionRate={form.sellingDestinationRate}
            onConversionRateChange={set('sellingDestinationRate')}
            conversionError={errors.sellingDestinationRate}
          />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Select label="Payment Terms" placeholder="Select payment terms" options={PAYMENT_TERMS.map((v) => ({ value: v, label: v }))} value={form.paymentTerms} onChange={set('paymentTerms')} />
          </div>

          <div>
            <label className={labelCls}>Valid Until</label>
            <input type="date" value={form.validUntil} onChange={setInput('validUntil')} className={`${inputCls} border-ink/30 font-mono sm:w-64`} />
          </div>
        </div>

        {/* 5. Profitability */}
        <div className={sectionCls}>
          <h2 className={sectionTitleCls}>5. Profitability</h2>
          <ProfitabilitySummary totals={totals} buyingCurrency={form.buyingCurrency} sellingCurrency={form.sellingCurrency} />
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
