'use client'

import { useEffect, useState } from 'react'
import Select from '@/components/ui/Select'
import * as stockApi from '@/services/stock'
import { useToast } from '@/components/ui/Toast'

// Local date-time <-> <input type="datetime-local"> (built from local components, not toISOString()).
const toDateTimeInput = (d) => {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const labelCls = 'mb-1 block font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted'
const inputCls = 'w-full border border-ink/30 bg-card px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-rust disabled:bg-paper/50'

const VGM_METHODS = [{ value: '1', label: 'Method 1 — packed container weighed' }, { value: '2', label: 'Method 2 — calculated' }]
const CONDITIONS = ['Sound', 'Damaged'].map((v) => ({ value: v, label: v }))
const GUARANTEE_OPTIONS = ['Received', 'Pending'].map((v) => ({ value: v, label: v }))
const CONTAINER_STATUS_OPTIONS = ['Empty Assigned', 'Gated-In', 'Loaded', 'Departed'].map((v) => ({ value: v, label: v }))
const VAS_OPTIONS = ['Not Uploaded', 'Uploaded'].map((v) => ({ value: v, label: v }))

const draftOf = (u) => ({
  sealNumber: u.sealNumber || '', customsSealNo: u.customsSealNo || '',
  payloadWeightKg: u.payloadWeightKg ?? '', cbm: u.cbm ?? '', packagesInContainer: u.packagesInContainer ?? '',
  vgmMethod: u.vgmMethod ? String(u.vgmMethod) : '', packingWeightKg: u.packingWeightKg ?? '', vgmWeightKg: u.vgmWeightKg ?? '',
  weighbridgeTicket: u.weighbridgeTicket || '', vgmDeclaredBy: u.vgmDeclaredBy || '', vgmSubmittedAt: toDateTimeInput(u.vgmSubmittedAt),
  conditionAtGateOut: u.conditionAtGateOut || '', conditionNotes: u.conditionNotes || '',
  gateOutEirNo: u.gateOutEirNo || '', gateInEirNo: u.gateInEirNo || '',
  guaranteeReceiptStatus: u.guaranteeReceiptStatus || '', containerStatus: u.containerStatus || '', vasUploadStatus: u.vasUploadStatus || '',
  gateOutDate: toDateTimeInput(u.gateOutDate), gateInDate: toDateTimeInput(u.gateInDate), lateGateInReason: u.lateGateInReason || '',
})

function Field({ label, children, className = '' }) {
  return (
    <div className={className}>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  )
}

// One card per allocated container — the PRD's Container Grid + Movement blocks (S3-20 .. S3-44).
function UnitCard({ unit, booking, tare, locked, canUpdate, onSaved }) {
  const toast = useToast()
  const [d, setD] = useState(() => draftOf(unit))
  const [saving, setSaving] = useState(false)
  const [warnings, setWarnings] = useState([])
  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e?.target ? e.target.value : e }))
  const editable = canUpdate && !locked

  const method2 = d.vgmMethod === '2'
  const calcVgm = method2 && tare > 0 && d.payloadWeightKg !== '' ? tare + Number(d.payloadWeightKg) + Number(d.packingWeightKg || 0) : null
  const daysOut = d.gateOutDate && d.gateInDate ? Math.max(0, Math.round((new Date(d.gateInDate) - new Date(d.gateOutDate)) / 86400000)) : null
  const lateGateIn = d.gateInDate && booking.cyGateInCutoff && new Date(d.gateInDate) > new Date(booking.cyGateInCutoff)

  const save = async () => {
    setSaving(true)
    try {
      const res = await stockApi.saveContainerUnit(unit._id, d)
      setWarnings(res.warnings || [])
      setD(draftOf(res.unit))
      toast(`${unit.containerNumber} saved`, 'success')
      onSaved?.()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 border border-ink/25 bg-card p-4" data-testid="unit-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
        <p className="font-mono text-sm font-bold text-ink">{unit.containerNumber} <span className="ml-2 text-muted">{unit.containerType?.code}</span></p>
        <p className="font-mono text-[11px] text-muted">
          {tare > 0 ? `Tare ${tare} kg` : 'Tare not set on the container type'}
          {unit.containerType?.maxPayloadKg ? ` · max payload ${unit.containerType.maxPayloadKg} kg` : ''}
          {unit.containerType?.capacityCbm ? ` · ${unit.containerType.capacityCbm} CBM` : ''}
        </p>
      </div>

      <fieldset disabled={!editable} className="space-y-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Field label="Seal No *"><input aria-label="Seal No" value={d.sealNumber} onChange={set('sealNumber')} className={inputCls} /></Field>
          <Field label="Customs seal"><input aria-label="Customs seal" value={d.customsSealNo} onChange={set('customsSealNo')} className={inputCls} /></Field>
          <Field label="Payload kg *"><input aria-label="Payload weight" type="number" min="0" value={d.payloadWeightKg} onChange={set('payloadWeightKg')} className={inputCls} /></Field>
          <Field label="CBM *"><input aria-label="Container CBM" type="number" min="0" value={d.cbm} onChange={set('cbm')} className={inputCls} /></Field>
          <Field label="Packages *"><input aria-label="Packages in container" type="number" min="0" value={d.packagesInContainer} onChange={set('packagesInContainer')} className={inputCls} /></Field>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <div className="col-span-2"><Select label="VGM method *" clearable placeholder="Select method" options={VGM_METHODS} value={d.vgmMethod} onChange={set('vgmMethod')} /></div>
          {method2 ? (
            <>
              <Field label="Packing & dunnage kg"><input aria-label="Packing weight" type="number" min="0" value={d.packingWeightKg} onChange={set('packingWeightKg')} className={inputCls} /></Field>
              <Field label="VGM kg (calculated)">
                <p aria-label="VGM weight" className="border border-ink/20 bg-paper/60 px-3 py-2 font-mono text-sm text-ink">{calcVgm !== null ? calcVgm : d.vgmWeightKg !== '' ? d.vgmWeightKg : tare > 0 ? '—' : 'needs a tare weight'}</p>
              </Field>
            </>
          ) : (
            <>
              <Field label="VGM kg *"><input aria-label="VGM weight" type="number" min="0" value={d.vgmWeightKg} onChange={set('vgmWeightKg')} className={inputCls} /></Field>
              <Field label="Weighbridge ticket"><input aria-label="Weighbridge ticket" value={d.weighbridgeTicket} onChange={set('weighbridgeTicket')} className={inputCls} /></Field>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Field label="VGM declared by *"><input aria-label="VGM declared by" value={d.vgmDeclaredBy} onChange={set('vgmDeclaredBy')} className={inputCls} /></Field>
          <Field label="VGM submitted to VO *"><input aria-label="VGM submitted" type="datetime-local" value={d.vgmSubmittedAt} onChange={set('vgmSubmittedAt')} className={inputCls} /></Field>
          <Select label="Condition at gate-out *" clearable placeholder="Select" options={CONDITIONS} value={d.conditionAtGateOut} onChange={set('conditionAtGateOut')} />
          <Field label="Condition notes"><input aria-label="Condition notes" value={d.conditionNotes} onChange={set('conditionNotes')} className={inputCls} /></Field>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-line pt-3 lg:grid-cols-5">
          <Field label="Gate-out (depot) *"><input aria-label="Gate-out date" type="datetime-local" value={d.gateOutDate} onChange={set('gateOutDate')} className={inputCls} /></Field>
          <Field label="Gate-in (port) *"><input aria-label="Gate-in date" type="datetime-local" value={d.gateInDate} onChange={set('gateInDate')} className={inputCls} /></Field>
          <Field label="Days out"><p className="border border-ink/20 bg-paper/60 px-3 py-2 font-mono text-sm text-ink">{daysOut ?? '-'}</p></Field>
          <Field label="Gate-out EIR"><input aria-label="Gate-out EIR" value={d.gateOutEirNo} onChange={set('gateOutEirNo')} className={inputCls} /></Field>
          <Field label="Gate-in EIR / receipt"><input aria-label="Gate-in EIR" value={d.gateInEirNo} onChange={set('gateInEirNo')} className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select label="Guarantee receipt" clearable placeholder="—" options={GUARANTEE_OPTIONS} value={d.guaranteeReceiptStatus} onChange={set('guaranteeReceiptStatus')} />
          <Select label="Container status" clearable placeholder="—" options={CONTAINER_STATUS_OPTIONS} value={d.containerStatus} onChange={set('containerStatus')} />
          <Select label="VAS upload" clearable placeholder="—" options={VAS_OPTIONS} value={d.vasUploadStatus} onChange={set('vasUploadStatus')} />
        </div>
        {lateGateIn && (
          <Field label="Reason for the late gate-in *">
            <input aria-label="Late gate-in reason" value={d.lateGateInReason} onChange={set('lateGateInReason')} className={inputCls} placeholder="Gate-in is after the CY cut-off" />
          </Field>
        )}
      </fieldset>

      {warnings.length > 0 && (
        <ul className="space-y-0.5 border border-signal/50 bg-signal/5 p-2 text-xs text-ink">{warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>
      )}
      {editable && (
        <div className="flex justify-end">
          <button type="button" onClick={save} disabled={saving} className="bg-rust px-4 py-2 text-sm font-semibold text-card transition-colors hover:bg-rust-dark disabled:opacity-50">
            {saving ? 'Saving…' : `Save ${unit.containerNumber}`}
          </button>
        </div>
      )}
    </div>
  )
}

export function ReconciliationPanel({ reconciliation }) {
  if (!reconciliation) return null
  return (
    <div className="space-y-2 border border-ink/25 bg-paper/50 p-4" data-testid="reconciliation">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-rust">Reconciliation (tolerance {Math.round(reconciliation.tolerance * 100)}%)</p>
        <span className={`font-mono text-[11px] font-bold uppercase ${reconciliation.pass ? 'text-stamp' : 'text-brick'}`}>{reconciliation.pass ? 'All checks pass' : 'Checks failing'}</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {reconciliation.checks.map((c) => (
          <div key={c.key} data-testid={`recon-${c.key}`} className={`border p-2.5 ${c.pass ? 'border-stamp/50' : 'border-brick/50 bg-brick/5'}`}>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{c.label}</p>
            <p className="font-mono text-sm text-ink">{c.actual}{c.unit ? ` ${c.unit}` : ''} <span className="text-muted">/ {c.skipped ? 'n/a' : `${c.expected}${c.unit ? ` ${c.unit}` : ''}`}</span></p>
            <p className={`font-mono text-[10px] font-bold uppercase ${c.pass ? 'text-stamp' : 'text-brick'}`}>{c.skipped ? 'not declared' : c.pass ? 'OK' : 'Variance'}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// Step 3 container grid for a confirmed booking: the containers actually allocated from stock.
export default function ContainerGrid({ booking, containerTypes = [], locked = false, canUpdate = true, onChanged }) {
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    stockApi.getContainers({ booking: booking._id })
      .then((rows) => { if (!cancelled) setUnits([...rows].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [booking._id, version])

  if (loading) return <p className="text-sm text-muted">Loading allocated containers…</p>
  if (units.length === 0) return <p className="text-sm text-muted">No containers allocated yet.</p>

  const tareOf = (u) => containerTypes.find((t) => t._id === (u.containerType?._id || u.containerType))?.tareWeightKg || 0
  return (
    <div className="space-y-3">
      {units.map((u) => (
        // keyed by the server's updatedAt: a save re-seeds the card with the (recalculated) saved values once they arrive
        <UnitCard key={`${u._id}-${u.updatedAt}`} unit={u} booking={booking} tare={tareOf(u)} locked={locked} canUpdate={canUpdate}
          onSaved={() => { setVersion((v) => v + 1); onChanged?.() }} />
      ))}
    </div>
  )
}
