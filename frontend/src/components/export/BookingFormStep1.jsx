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
  blNo: '',
  containers: [{ containerType: '', quantity: 1 }],
}

const labelCls = 'mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted'
const inputCls = 'w-full border bg-card px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust'

export default function BookingFormStep1({ ports = [], containerTypes = [], stockMap = {}, submitting = false, onSubmit }) {
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})

  const portOptions = ports.map((p) => ({ value: p._id, label: `${p.code} — ${p.name}` }))

  const set = (field) => (v) => setForm((f) => ({ ...f, [field]: v }))
  const setInput = (field) => (e) => set(field)(e.target.value)

  const validate = () => {
    const next = {}
    if (!form.jobNo.trim()) next.jobNo = 'Job number is required'
    if (!form.clientName.trim()) next.clientName = 'Client name is required'
    if (!form.clientPhone.trim()) next.clientPhone = 'Client phone is required'
    if (!/^\S+@\S+\.\S+$/.test(form.clientEmail)) next.clientEmail = 'Enter a valid client email'
    if (!form.pol) next.pol = 'Port of loading is required'
    if (!form.pod) next.pod = 'Port of discharge is required'
    const validContainers = form.containers.filter((c) => c.containerType && c.quantity >= 1)
    if (validContainers.length === 0) next.containers = 'Add at least one container entry'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!validate()) return
    onSubmit({
      jobNo: form.jobNo.trim(),
      clientName: form.clientName.trim(),
      clientPhone: form.clientPhone.trim(),
      clientEmail: form.clientEmail.trim(),
      pol: form.pol,
      pod: form.pod,
      blNo: form.blNo.trim() || undefined,
      containers: form.containers.filter((c) => c.containerType && c.quantity >= 1),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label className={labelCls}>
            Job No <span className="text-rust">*</span>
          </label>
          <input
            value={form.jobNo}
            onChange={setInput('jobNo')}
            className={`${inputCls} font-mono ${errors.jobNo ? 'border-brick' : 'border-ink/20'}`}
            placeholder="JOB-2026-0001"
          />
          {errors.jobNo && <p className="mt-1 font-mono text-xs text-brick">{errors.jobNo}</p>}
        </div>
        <div>
          <label className={labelCls}>
            B/L No <span className="normal-case text-muted/70">(optional)</span>
          </label>
          <input
            value={form.blNo}
            onChange={setInput('blNo')}
            className={`${inputCls} border-ink/20 font-mono`}
            placeholder="Bill of lading number"
          />
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
          {submitting ? 'Filing booking…' : 'Create booking'}
        </button>
      </div>
    </form>
  )
}
