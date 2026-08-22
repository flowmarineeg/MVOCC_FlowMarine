'use client'

import { useState } from 'react'
import Select from '@/components/ui/Select'
import ContainerSelector from './ContainerSelector'

const emptyForm = {
  jobNo: '',
  clientName: '',
  clientPhone: '',
  clientEmail: '',
  pol: '',
  pod: '',
  commodity: '',
  ucrNumber: '',
  exportTaxNumber: '',
  importTaxNumber: '',
  importCountry: '',
  packagesCount: '',
  vgm: '',
  isDangerous: false,
  dangerousNumber: '',
  shippingDeclaration: null,
  containers: [{ containerType: '', quantity: 1 }],
}

const labelCls = 'mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted'
const inputCls = 'w-full border bg-card px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust'
const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

function buildInitialForm(booking) {
  if (!booking) return emptyForm
  return {
    jobNo: booking.jobNo || '',
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
    isDangerous: !!booking.isDangerous,
    dangerousNumber: booking.dangerousNumber || '',
    shippingDeclaration: null,
    containers: (booking.containers || []).map((c) => ({
      containerType: c.containerType?._id || c.containerType,
      quantity: c.quantity,
    })),
  }
}

export default function BookingFormStep1({ booking = null, ports = [], containerTypes = [], stockMap = {}, submitting = false, onSubmit }) {
  const isEdit = !!booking
  const [form, setForm] = useState(() => buildInitialForm(booking))
  const [errors, setErrors] = useState({})

  const portOptions = ports.map((p) => ({ value: p._id, label: `${p.code} — ${p.name}` }))

  const set = (field) => (v) => setForm((f) => ({ ...f, [field]: v }))
  const setInput = (field) => (e) => set(field)(e.target.value)

  const handleFileChange = (e) => {
    const file = e.target.files?.[0] || null
    if (file && !ALLOWED_FILE_TYPES.includes(file.type)) {
      setErrors((prev) => ({ ...prev, shippingDeclaration: 'Only PDF or image files (JPG, PNG, WEBP) are allowed' }))
      e.target.value = ''
      return
    }
    setErrors((prev) => {
      const next = { ...prev }
      delete next.shippingDeclaration
      return next
    })
    set('shippingDeclaration')(file)
  }

  const validate = () => {
    const next = {}
    if (!form.jobNo.trim()) next.jobNo = 'Job number is required'
    if (!form.clientName.trim()) next.clientName = 'Client name is required'
    if (!form.clientPhone.trim()) next.clientPhone = 'Client phone is required'
    if (!/^\S+@\S+\.\S+$/.test(form.clientEmail)) next.clientEmail = 'Enter a valid client email'
    if (!form.pol) next.pol = 'Port of loading is required'
    if (!form.pod) next.pod = 'Port of discharge is required'
    if (!form.commodity.trim()) next.commodity = 'Commodity is required'
    if (form.packagesCount && Number(form.packagesCount) < 0) next.packagesCount = 'Number of packages must be a positive number'
    if (form.vgm && Number(form.vgm) < 0) next.vgm = 'VGM must be a positive number'
    if (form.isDangerous && !form.dangerousNumber.trim()) {
      next.dangerousNumber = 'Dangerous goods number is required'
    }
    const validContainers = form.containers.filter((c) => c.containerType && c.quantity >= 1)
    if (validContainers.length === 0) next.containers = 'Add at least one container entry'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!validate()) return

    const fd = new FormData()
    if (!isEdit) fd.append('jobNo', form.jobNo.trim())
    fd.append('clientName', form.clientName.trim())
    fd.append('clientPhone', form.clientPhone.trim())
    fd.append('clientEmail', form.clientEmail.trim())
    fd.append('pol', form.pol)
    fd.append('pod', form.pod)
    fd.append('commodity', form.commodity.trim())
    if (form.ucrNumber.trim()) fd.append('ucrNumber', form.ucrNumber.trim())
    if (form.exportTaxNumber.trim()) fd.append('exportTaxNumber', form.exportTaxNumber.trim())
    if (form.importTaxNumber.trim()) fd.append('importTaxNumber', form.importTaxNumber.trim())
    if (form.importCountry.trim()) fd.append('importCountry', form.importCountry.trim())
    if (form.packagesCount) fd.append('packagesCount', form.packagesCount)
    if (form.vgm) fd.append('vgm', form.vgm)
    fd.append('isDangerous', String(form.isDangerous))
    if (form.isDangerous) fd.append('dangerousNumber', form.dangerousNumber.trim())
    fd.append(
      'containers',
      JSON.stringify(form.containers.filter((c) => c.containerType && c.quantity >= 1))
    )
    if (form.shippingDeclaration) fd.append('shippingDeclaration', form.shippingDeclaration)

    onSubmit(fd)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label className={labelCls}>
            Job No {isEdit ? <span className="normal-case text-muted/70">(cannot be changed)</span> : <span className="text-rust">*</span>}
          </label>
          <input
            value={form.jobNo}
            onChange={setInput('jobNo')}
            disabled={isEdit}
            className={`${inputCls} font-mono ${errors.jobNo ? 'border-brick' : 'border-ink/20'} ${isEdit ? 'cursor-not-allowed bg-paper text-muted' : ''}`}
            placeholder="JOB-2026-0001"
          />
          {errors.jobNo && <p className="mt-1 font-mono text-xs text-brick">{errors.jobNo}</p>}
        </div>
        <div>
          <label className={labelCls}>
            Commodity <span className="text-rust">*</span>
          </label>
          <input
            value={form.commodity}
            onChange={setInput('commodity')}
            className={`${inputCls} ${errors.commodity ? 'border-brick' : 'border-ink/20'}`}
            placeholder="e.g. Frozen poultry"
          />
          {errors.commodity && <p className="mt-1 font-mono text-xs text-brick">{errors.commodity}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div>
          <label className={labelCls}>
            Client Name <span className="text-rust">*</span>
          </label>
          <input
            value={form.clientName}
            onChange={setInput('clientName')}
            className={`${inputCls} ${errors.clientName ? 'border-brick' : 'border-ink/20'}`}
          />
          {errors.clientName && <p className="mt-1 font-mono text-xs text-brick">{errors.clientName}</p>}
        </div>
        <div>
          <label className={labelCls}>
            Client Phone <span className="text-rust">*</span>
          </label>
          <input
            value={form.clientPhone}
            onChange={setInput('clientPhone')}
            className={`${inputCls} ${errors.clientPhone ? 'border-brick' : 'border-ink/20'}`}
          />
          {errors.clientPhone && <p className="mt-1 font-mono text-xs text-brick">{errors.clientPhone}</p>}
        </div>
        <div>
          <label className={labelCls}>
            Client Email <span className="text-rust">*</span>
          </label>
          <input
            type="email"
            value={form.clientEmail}
            onChange={setInput('clientEmail')}
            className={`${inputCls} ${errors.clientEmail ? 'border-brick' : 'border-ink/20'}`}
          />
          {errors.clientEmail && <p className="mt-1 font-mono text-xs text-brick">{errors.clientEmail}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Select
          label="Port of Loading (POL)"
          required
          searchable
          placeholder="Select POL"
          options={portOptions}
          value={form.pol}
          onChange={set('pol')}
          error={errors.pol}
        />
        <Select
          label="Port of Discharge (POD)"
          required
          searchable
          placeholder="Select POD"
          options={portOptions}
          value={form.pod}
          onChange={set('pod')}
          error={errors.pod}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={labelCls}>
            UCR Number <span className="normal-case text-muted/70">(optional)</span>
          </label>
          <input
            value={form.ucrNumber}
            onChange={setInput('ucrNumber')}
            className={`${inputCls} border-ink/20 font-mono`}
            placeholder="Unique Consignment Ref."
          />
        </div>
        <div>
          <label className={labelCls}>
            Export Tax Number <span className="normal-case text-muted/70">(optional)</span>
          </label>
          <input
            value={form.exportTaxNumber}
            onChange={setInput('exportTaxNumber')}
            className={`${inputCls} border-ink/20 font-mono`}
          />
        </div>
        <div>
          <label className={labelCls}>
            Import Tax Number <span className="normal-case text-muted/70">(optional)</span>
          </label>
          <input
            value={form.importTaxNumber}
            onChange={setInput('importTaxNumber')}
            className={`${inputCls} border-ink/20 font-mono`}
          />
        </div>
        <div>
          <label className={labelCls}>
            Import Country <span className="normal-case text-muted/70">(optional)</span>
          </label>
          <input
            value={form.importCountry}
            onChange={setInput('importCountry')}
            className={`${inputCls} border-ink/20`}
            placeholder="Country of final destination"
          />
        </div>
        <div>
          <label className={labelCls}>
            No. of Packages <span className="normal-case text-muted/70">(optional)</span>
          </label>
          <input
            type="number"
            min="0"
            value={form.packagesCount}
            onChange={setInput('packagesCount')}
            className={`${inputCls} font-mono ${errors.packagesCount ? 'border-brick' : 'border-ink/20'}`}
          />
          {errors.packagesCount && <p className="mt-1 font-mono text-xs text-brick">{errors.packagesCount}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label className={labelCls}>
            VGM (kg) <span className="normal-case text-muted/70">(optional)</span>
          </label>
          <input
            type="number"
            min="0"
            value={form.vgm}
            onChange={setInput('vgm')}
            className={`${inputCls} font-mono ${errors.vgm ? 'border-brick' : 'border-ink/20'}`}
            placeholder="Verified gross mass"
          />
          {errors.vgm && <p className="mt-1 font-mono text-xs text-brick">{errors.vgm}</p>}
        </div>
        <div>
          <label className={labelCls}>Dangerous Goods</label>
          <div className="flex border border-ink/20">
            <button
              type="button"
              onClick={() => set('isDangerous')(false)}
              className={`flex-1 py-2.5 text-sm font-semibold uppercase tracking-wide transition-colors ${
                !form.isDangerous ? 'bg-ink text-paper' : 'bg-card text-muted hover:text-ink'
              }`}
            >
              No
            </button>
            <button
              type="button"
              onClick={() => set('isDangerous')(true)}
              className={`flex-1 border-l border-ink/20 py-2.5 text-sm font-semibold uppercase tracking-wide transition-colors ${
                form.isDangerous ? 'bg-brick text-card' : 'bg-card text-muted hover:text-ink'
              }`}
            >
              Yes
            </button>
          </div>
        </div>
      </div>

      {form.isDangerous && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className={labelCls}>
              Dangerous Goods Number <span className="text-rust">*</span>
            </label>
            <input
              value={form.dangerousNumber}
              onChange={setInput('dangerousNumber')}
              className={`${inputCls} font-mono ${errors.dangerousNumber ? 'border-brick' : 'border-ink/20'}`}
              placeholder="UN Number / IMO Class"
            />
            {errors.dangerousNumber && <p className="mt-1 font-mono text-xs text-brick">{errors.dangerousNumber}</p>}
          </div>
        </div>
      )}

      <div>
        <label className={labelCls}>
          Shipping Declaration <span className="normal-case text-muted/70">(optional, PDF or image)</span>
        </label>
        <label
          className={`flex cursor-pointer items-center justify-between border bg-card px-3.5 py-2.5 text-sm text-muted transition-colors hover:border-ink/40 ${
            errors.shippingDeclaration ? 'border-brick' : 'border-ink/20'
          }`}
        >
          <span className="truncate">
            {form.shippingDeclaration
              ? form.shippingDeclaration.name
              : isEdit && booking.shippingDeclaration?.fileName
                ? booking.shippingDeclaration.fileName
                : 'Choose file (PDF, JPG, PNG)…'}
          </span>
          <span className="ml-3 shrink-0 font-mono text-[10px] uppercase tracking-wide text-rust">Browse</span>
          <input type="file" accept="application/pdf,image/*" className="hidden" onChange={handleFileChange} />
        </label>
        {isEdit && booking.shippingDeclaration?.fileName && !form.shippingDeclaration && (
          <p className="mt-1 text-xs text-muted">Currently attached — choose a new file to replace it.</p>
        )}
        {errors.shippingDeclaration && <p className="mt-1 font-mono text-xs text-brick">{errors.shippingDeclaration}</p>}
      </div>

      <div>
        <label className={labelCls}>
          Containers <span className="text-rust">*</span>
        </label>
        <ContainerSelector
          containerTypes={containerTypes}
          stockMap={stockMap}
          value={form.containers}
          onChange={set('containers')}
        />
        {errors.containers && <p className="mt-1 font-mono text-xs text-brick">{errors.containers}</p>}
      </div>

      <div className="flex justify-end border-t border-line pt-5">
        <button
          type="submit"
          disabled={submitting}
          className="bg-rust px-6 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-rust-dark disabled:opacity-50"
        >
          {submitting ? (isEdit ? 'Saving…' : 'Filing booking…') : isEdit ? 'Save changes' : 'Create booking'}
        </button>
      </div>
    </form>
  )
}
