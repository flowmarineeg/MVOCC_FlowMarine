'use client'

import { useState } from 'react'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import ContainerSelector from './ContainerSelector'

const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '')

const manifestOptions = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'CONFIRMED', label: 'Confirmed' },
]

const emptyParty = { name: '', email: '', phone1: '', phone2: '', address: '', taxNumber: '' }
const emptyAgent = { name: '', email: '', phone: '', address: '' }

function buildInitialForm(booking) {
  return {
    nvocc: booking.nvocc?._id || '',
    price: booking.price ?? '',
    cost: booking.cost ?? '',
    freeTime: toDateInput(booking.freeTime),
    gateInDate: toDateInput(booking.gateInDate),
    gateOutDate: toDateInput(booking.gateOutDate),
    containerLocation: booking.containerLocation || '',
    blNo: booking.blNo || '',
    containers: (booking.containers || []).map((c) => ({
      containerType: c.containerType?._id || c.containerType,
      quantity: c.quantity,
    })),
    shipper: { ...emptyParty, ...(booking.shipper || {}) },
    consignee: { ...emptyParty, ...(booking.consignee || {}) },
    carrier: booking.carrier?._id || '',
    vesselName: booking.vesselName || '',
    voyageNo: booking.voyageNo || '',
    etd: toDateInput(booking.etd),
    atd: toDateInput(booking.atd),
    eta: toDateInput(booking.eta),
    ata: toDateInput(booking.ata),
    polAgent: { ...emptyAgent, ...(booking.polAgent || {}) },
    podAgent: { ...emptyAgent, ...(booking.podAgent || {}) },
    manifestStatus: booking.manifestStatus || 'PENDING',
    notes: booking.notes || '',
  }
}

function Section({ title, children }) {
  return (
    <div className="border border-ink/15 bg-card">
      <div className="border-t-[3px] border-rust" />
      <div className="p-5">
        <h3 className="mb-4 font-display text-base font-bold uppercase tracking-wide text-ink">{title}</h3>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, span, children }) {
  return (
    <div className={span === 2 ? 'sm:col-span-2' : ''}>
      <label className="mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</label>
      {children}
    </div>
  )
}

function SubHeading({ children, first }) {
  return (
    <div className={`sm:col-span-4 ${first ? '' : 'mt-1 border-t border-line pt-4'}`}>
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-rust">{children}</p>
    </div>
  )
}

const inputCls = 'w-full border border-ink/20 bg-paper px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust'
const monoInputCls = `${inputCls} font-mono`

export default function BookingFormStep2({
  booking,
  carriers = [],
  nvoccs = [],
  containerTypes = [],
  stockMap = {},
  saving = false,
  confirming = false,
  cancelling = false,
  canUpdate = false,
  onSave,
  onConfirm,
  onCancel,
}) {
  const [form, setForm] = useState(() => buildInitialForm(booking))
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)

  const set = (field) => (v) => setForm((f) => ({ ...f, [field]: v }))
  const setInput = (field) => (e) => set(field)(e.target.value)
  const setNested = (section, key) => (e) =>
    setForm((f) => ({ ...f, [section]: { ...f[section], [key]: e.target.value } }))

  const carrierOptions = carriers.map((c) => ({ value: c._id, label: `${c.name} (${c.code})` }))
  const nvoccOptions = nvoccs.map((n) => ({ value: n._id, label: `${n.name} (${n.code})` }))

  const isCancelled = booking.status === 'cancelled'

  const handleSave = (e) => {
    e.preventDefault()
    const payload = {
      ...form,
      price: form.price === '' ? undefined : Number(form.price),
      cost: form.cost === '' ? undefined : Number(form.cost),
      containers: form.containers.filter((c) => c.containerType && c.quantity >= 1),
    }
    Object.keys(payload).forEach((k) => payload[k] === '' && delete payload[k])
    onSave(payload)
  }

  return (
    <fieldset disabled={isCancelled || !canUpdate} className="space-y-4 disabled:opacity-60">
      <form onSubmit={handleSave} className="space-y-4">
        <Section title="Commercial">
          <Field label="NVOCC">
            <Select searchable placeholder="Select NVOCC" options={nvoccOptions} value={form.nvocc} onChange={set('nvocc')} />
          </Field>
          <Field label="Price"><input type="number" min={0} value={form.price} onChange={setInput('price')} className={monoInputCls} /></Field>
          <Field label="Cost"><input type="number" min={0} value={form.cost} onChange={setInput('cost')} className={monoInputCls} /></Field>
          <Field label="Free Time"><input type="date" value={form.freeTime} onChange={setInput('freeTime')} className={monoInputCls} /></Field>
        </Section>

        <Section title="Container & Location">
          <Field label="Gate In Date"><input type="date" value={form.gateInDate} onChange={setInput('gateInDate')} className={monoInputCls} /></Field>
          <Field label="Gate Out Date"><input type="date" value={form.gateOutDate} onChange={setInput('gateOutDate')} className={monoInputCls} /></Field>
          <Field label="Container Location" span={2}>
            <input value={form.containerLocation} onChange={setInput('containerLocation')} className={inputCls} placeholder="Yard A — Block 3" />
          </Field>
          <div className="sm:col-span-4">
            <label className="mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Confirmed Containers</label>
            <ContainerSelector containerTypes={containerTypes} stockMap={stockMap} value={form.containers} onChange={set('containers')} />
          </div>
        </Section>

        <Section title="Parties">
          <SubHeading first>Shipper</SubHeading>
          <Field label="Name" span={2}><input value={form.shipper.name} onChange={setNested('shipper', 'name')} className={inputCls} /></Field>
          <Field label="Email" span={2}><input type="email" value={form.shipper.email} onChange={setNested('shipper', 'email')} className={inputCls} /></Field>
          <Field label="Phone 1"><input value={form.shipper.phone1} onChange={setNested('shipper', 'phone1')} className={inputCls} /></Field>
          <Field label="Phone 2"><input value={form.shipper.phone2} onChange={setNested('shipper', 'phone2')} className={inputCls} /></Field>
          <Field label="Address" span={2}><input value={form.shipper.address} onChange={setNested('shipper', 'address')} className={inputCls} /></Field>
          <Field label="Tax Number" span={2}><input value={form.shipper.taxNumber} onChange={setNested('shipper', 'taxNumber')} className={monoInputCls} /></Field>

          <SubHeading>Consignee</SubHeading>
          <Field label="Name" span={2}><input value={form.consignee.name} onChange={setNested('consignee', 'name')} className={inputCls} /></Field>
          <Field label="Email" span={2}><input type="email" value={form.consignee.email} onChange={setNested('consignee', 'email')} className={inputCls} /></Field>
          <Field label="Phone 1"><input value={form.consignee.phone1} onChange={setNested('consignee', 'phone1')} className={inputCls} /></Field>
          <Field label="Phone 2"><input value={form.consignee.phone2} onChange={setNested('consignee', 'phone2')} className={inputCls} /></Field>
          <Field label="Address" span={2}><input value={form.consignee.address} onChange={setNested('consignee', 'address')} className={inputCls} /></Field>
          <Field label="Tax Number" span={2}><input value={form.consignee.taxNumber} onChange={setNested('consignee', 'taxNumber')} className={monoInputCls} /></Field>
        </Section>

        <Section title="Vessel & Schedule">
          <Field label="B/L No"><input value={form.blNo} onChange={setInput('blNo')} className={monoInputCls} /></Field>
          <Field label="Carrier">
            <Select searchable placeholder="Select carrier" options={carrierOptions} value={form.carrier} onChange={set('carrier')} />
          </Field>
          <Field label="Vessel Name"><input value={form.vesselName} onChange={setInput('vesselName')} className={inputCls} placeholder="e.g. MSC OSCAR" /></Field>
          <Field label="Voyage No" span={2}><input value={form.voyageNo} onChange={setInput('voyageNo')} className={monoInputCls} /></Field>
          <Field label="ETD"><input type="date" value={form.etd} onChange={setInput('etd')} className={monoInputCls} /></Field>
          <Field label="ATD"><input type="date" value={form.atd} onChange={setInput('atd')} className={monoInputCls} /></Field>
          <Field label="ETA"><input type="date" value={form.eta} onChange={setInput('eta')} className={monoInputCls} /></Field>
          <Field label="ATA"><input type="date" value={form.ata} onChange={setInput('ata')} className={monoInputCls} /></Field>
        </Section>

        <Section title="Agents">
          <SubHeading first>POL Agent</SubHeading>
          <Field label="Agent Name" span={2}><input value={form.polAgent.name} onChange={setNested('polAgent', 'name')} className={inputCls} /></Field>
          <Field label="Email"><input type="email" value={form.polAgent.email} onChange={setNested('polAgent', 'email')} className={inputCls} /></Field>
          <Field label="Phone"><input value={form.polAgent.phone} onChange={setNested('polAgent', 'phone')} className={inputCls} /></Field>
          <Field label="Address" span={2}><input value={form.polAgent.address} onChange={setNested('polAgent', 'address')} className={inputCls} /></Field>

          <SubHeading>POD Agent</SubHeading>
          <Field label="Agent Name" span={2}><input value={form.podAgent.name} onChange={setNested('podAgent', 'name')} className={inputCls} /></Field>
          <Field label="Email"><input type="email" value={form.podAgent.email} onChange={setNested('podAgent', 'email')} className={inputCls} /></Field>
          <Field label="Phone"><input value={form.podAgent.phone} onChange={setNested('podAgent', 'phone')} className={inputCls} /></Field>
          <Field label="Address" span={2}><input value={form.podAgent.address} onChange={setNested('podAgent', 'address')} className={inputCls} /></Field>
        </Section>

        <Section title="Status & Notes">
          <Field label="Manifest Status" span={2}>
            <Select options={manifestOptions} value={form.manifestStatus} onChange={set('manifestStatus')} />
          </Field>
          <Field label="Notes" span={2}>
            <textarea rows={2} value={form.notes} onChange={setInput('notes')} className={inputCls} placeholder="Free text notes..." />
          </Field>
        </Section>

        {canUpdate && (
          <div className="flex flex-col justify-end gap-3 pt-1 sm:flex-row">
            {!isCancelled && (
              <button
                type="button"
                onClick={() => setCancelOpen(true)}
                className="border border-brick/40 px-5 py-2.5 text-sm font-medium text-brick transition-colors hover:bg-brick/5"
              >
                Cancel booking
              </button>
            )}
            {booking.status === 'pending' && (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="bg-stamp px-5 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-stamp/90"
              >
                Confirm booking
              </button>
            )}
            <button
              type="submit"
              disabled={saving || isCancelled}
              className="bg-rust px-6 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-rust-dark disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </form>

      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => { onConfirm(); setConfirmOpen(false) }}
        title="Confirm this booking?"
        message="This will stamp the booking as confirmed and decrement container stock for the confirmed quantities."
        confirmLabel="Confirm booking"
        loading={confirming}
      />
      <Modal
        isOpen={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => { onCancel(); setCancelOpen(false) }}
        title="Cancel this booking?"
        message="This stamps the booking as cancelled. If it was confirmed, stock is restored."
        confirmLabel="Cancel booking"
        danger
        loading={cancelling}
      />
    </fieldset>
  )
}
