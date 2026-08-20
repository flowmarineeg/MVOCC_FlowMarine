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

function buildInitialForm(booking) {
  return {
    price: booking.price ?? '',
    cost: booking.cost ?? '',
    freeTimeEstimated: toDateInput(booking.freeTimeEstimated),
    freeTimeFinal: toDateInput(booking.freeTimeFinal),
    gateInDate: toDateInput(booking.gateInDate),
    gateOutDate: toDateInput(booking.gateOutDate),
    containerLocation: booking.containerLocation || '',
    containers: (booking.containers || []).map((c) => ({
      containerType: c.containerType?._id || c.containerType,
      quantity: c.quantity,
    })),
    shipper: booking.shipper || '',
    consignee: booking.consignee || '',
    mainVessel: booking.mainVessel?._id || '',
    voyageNo: booking.voyageNo || '',
    etd: toDateInput(booking.etd),
    atd: toDateInput(booking.atd),
    eta: toDateInput(booking.eta),
    ata: toDateInput(booking.ata),
    polAgent: booking.polAgent?._id || '',
    podAgent: booking.podAgent?._id || '',
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

const inputCls = 'w-full border border-ink/20 bg-paper px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust'
const monoInputCls = `${inputCls} font-mono`

export default function BookingFormStep2({
  booking,
  vessels = [],
  agents = [],
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

  const vesselOptions = vessels.map((v) => ({ value: v._id, label: `${v.name} (${v.code})` }))
  const polAgentOptions = agents
    .filter((a) => a.type === 'POL' || a.type === 'BOTH')
    .map((a) => ({ value: a._id, label: a.name }))
  const podAgentOptions = agents
    .filter((a) => a.type === 'POD' || a.type === 'BOTH')
    .map((a) => ({ value: a._id, label: a.name }))

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
          <Field label="Price"><input type="number" min={0} value={form.price} onChange={setInput('price')} className={monoInputCls} /></Field>
          <Field label="Cost"><input type="number" min={0} value={form.cost} onChange={setInput('cost')} className={monoInputCls} /></Field>
          <Field label="Free Time (Est.)"><input type="date" value={form.freeTimeEstimated} onChange={setInput('freeTimeEstimated')} className={monoInputCls} /></Field>
          <Field label="Free Time (Final)"><input type="date" value={form.freeTimeFinal} onChange={setInput('freeTimeFinal')} className={monoInputCls} /></Field>
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
          <Field label="Shipper" span={2}><input value={form.shipper} onChange={setInput('shipper')} className={inputCls} /></Field>
          <Field label="Consignee" span={2}><input value={form.consignee} onChange={setInput('consignee')} className={inputCls} /></Field>
        </Section>

        <Section title="Vessel & Schedule">
          <Field label="Main Vessel" span={2}>
            <Select searchable placeholder="Select vessel" options={vesselOptions} value={form.mainVessel} onChange={set('mainVessel')} />
          </Field>
          <Field label="Voyage No" span={2}><input value={form.voyageNo} onChange={setInput('voyageNo')} className={monoInputCls} /></Field>
          <Field label="ETD"><input type="date" value={form.etd} onChange={setInput('etd')} className={monoInputCls} /></Field>
          <Field label="ATD"><input type="date" value={form.atd} onChange={setInput('atd')} className={monoInputCls} /></Field>
          <Field label="ETA"><input type="date" value={form.eta} onChange={setInput('eta')} className={monoInputCls} /></Field>
          <Field label="ATA"><input type="date" value={form.ata} onChange={setInput('ata')} className={monoInputCls} /></Field>
        </Section>

        <Section title="Agents">
          <Field label="POL Agent" span={2}>
            <Select searchable placeholder="Select POL agent" options={polAgentOptions} value={form.polAgent} onChange={set('polAgent')} />
          </Field>
          <Field label="POD Agent" span={2}>
            <Select searchable placeholder="Select POD agent" options={podAgentOptions} value={form.podAgent} onChange={set('podAgent')} />
          </Field>
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
