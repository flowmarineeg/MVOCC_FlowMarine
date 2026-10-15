// Sprint 007 — the actions of the Booking & Job page that change more than field values:
// Complete step, Amend (reopen), roll-over, Generate Draft B/L, Issue / Re-issue HBL, pre-alert,
// and the data the document builders need. See sprints/007sprint.txt (D2, D3, D9..D14).

import Booking from './booking.model.js'
import JobCounter from './jobCounter.model.js'
import Container from '../../MasterData/Container/container.model.js'
import Nvocc from '../../MasterData/Nvocc/nvocc.model.js'
import Agent from '../../MasterData/Agent/agent.model.js'
import { sendPreAlertEmail } from '../../../utils/email.service.js'
import {
  STEP_COUNT, loadContext, computeStepIssues, isStepComplete, isIssued, releaseHold,
} from './booking.steps.js'

const fail = (status, message, extra = {}) => Object.assign(new Error(message), { statusCode: status, ...extra })

const loadBooking = async (id) => {
  const booking = await Booking.findById(id)
  if (!booking) throw fail(404, 'Booking not found')
  return booking
}

const parseStep = (n) => {
  const step = Number(n)
  if (!Number.isInteger(step) || step < 1 || step > STEP_COUNT) throw fail(400, 'Step must be a number from 1 to 5')
  return step
}

// ─── Complete a step (G5): checks the step, stamps user + time, locks its fields ──
export const completeStep = async (id, n, user) => {
  const step = parseStep(n)
  const booking = await loadBooking(id)
  if (booking.status === 'cancelled') throw fail(400, 'A cancelled booking cannot be completed')
  if (step === 5) throw fail(400, 'Step 5 is completed by issuing the HBL — use Issue HBL')
  // a step flagged "Re-confirm" after an earlier Amend is still stamped; completing it again clears the flag
  const reconfirming = isStepComplete(booking, step) && (booking.reconfirmSteps || []).includes(step)
  if (isStepComplete(booking, step) && !reconfirming) throw fail(400, `Step ${step} is already complete`)
  if (isIssued(booking)) throw fail(409, 'The HBL has been issued — re-issue it (Amend) to change the job')
  if (step > 1 && !isStepComplete(booking, step - 1)) throw fail(400, `Complete Step ${step - 1} first`)

  const ctx = await loadContext(booking)
  const issues = computeStepIssues(booking, ctx)[step]
  if (issues.length > 0) throw fail(400, `Step ${step} is not ready: ${issues.slice(0, 3).join('; ')}${issues.length > 3 ? ` (+${issues.length - 3} more)` : ''}`, { issues })

  booking.stepsCompleted = booking.stepsCompleted.filter((s) => s.step !== step)
  booking.stepsCompleted.push({ step, completedAt: new Date(), completedBy: user?._id || user?.id })
  booking.reconfirmSteps = (booking.reconfirmSteps || []).filter((s) => s !== step)
  await booking.save()
  return booking
}

// ─── Amend (G1 / BR-2.3): reopen a completed step with a reason ───────────────
export const reopenStep = async (id, n, reason, user) => {
  const step = parseStep(n)
  const booking = await loadBooking(id)
  if (!reason || String(reason).trim().length < 3) throw fail(400, 'A reason is required to amend a completed step')
  if (isIssued(booking)) throw fail(409, 'The HBL has been issued — use Re-issue HBL to amend the job')
  if (!isStepComplete(booking, step)) throw fail(400, `Step ${step} is not complete`)

  booking.stepsCompleted = booking.stepsCompleted.filter((s) => s.step !== step)
  // every later step that was already completed must be re-confirmed (G1)
  const later = booking.stepsCompleted.map((s) => s.step).filter((s) => s > step)
  booking.reconfirmSteps = [...new Set([...(booking.reconfirmSteps || []), ...later])].sort()
  booking.amendments.push({ step, reason: String(reason).trim(), by: user?._id || user?.id, at: new Date() })
  await booking.save()
  return booking
}

// ─── Roll-over / vessel change (BR-2.3 / BR-2.4, D10) ────────────────────────
const ROLL_SNAPSHOT_FIELDS = [
  'carrier', 'vesselName', 'vesselImo', 'voyageNo', 'carrierBookingRef', 'etd', 'eta', 'siCutoff', 'vgmCutoff',
  'cyGateInCutoff', 'cyOpeningCutoff', 'customsCutoff', 'dgCutoff', 'polTerminal', 'podTerminal', 'spaceConfirmationStatus',
  'confirmedEquipment',
]

export const rollBooking = async (id, reason, user) => {
  const booking = await loadBooking(id)
  if (!reason || String(reason).trim().length < 3) throw fail(400, 'A reason is required for a roll-over')
  if (isIssued(booking)) throw fail(409, 'The HBL has been issued — re-issue it before rolling the booking')
  if (booking.status === 'cancelled') throw fail(400, 'A cancelled booking cannot be rolled')

  const snapshot = {}
  for (const f of ROLL_SNAPSHOT_FIELDS) snapshot[f] = booking.get(f) ?? null
  booking.bookingVersions.push({
    version: (booking.bookingVersions || []).length + 1,
    reason: String(reason).trim(),
    by: user?._id || user?.id,
    at: new Date(),
    snapshot: JSON.parse(JSON.stringify(snapshot)),
  })
  booking.spaceConfirmationStatus = 'Rolled'
  if (isStepComplete(booking, 2)) {
    booking.stepsCompleted = booking.stepsCompleted.filter((s) => s.step !== 2)
    const later = booking.stepsCompleted.map((s) => s.step).filter((s) => s > 2)
    booking.reconfirmSteps = [...new Set([...(booking.reconfirmSteps || []), ...later])].sort()
    booking.amendments.push({ step: 2, reason: `Roll-over: ${String(reason).trim()}`, by: user?._id || user?.id, at: new Date() })
  }
  await booking.save()
  return booking
}

// ─── Step 4: Generate Draft B/L (S4-50 / S4-51) ──────────────────────────────
export const generateDraft = async (id, user, note) => {
  const booking = await loadBooking(id)
  if (booking.status === 'cancelled') throw fail(400, 'A cancelled booking has no B/L')
  if (isIssued(booking)) throw fail(409, 'The HBL has been issued — re-issue it (Amend) to change the B/L')
  if (isStepComplete(booking, 4)) throw fail(409, 'Step 4 is complete and locked — Amend it first to send a new draft')
  if (!isStepComplete(booking, 3)) throw fail(400, 'Complete Step 3 (Depot / Container) before generating the draft B/L')
  const missing = ['exactShipper', 'exactConsignee', 'exactNotify'].filter((f) => !String(booking[f] || '').trim())
  if (missing.length) throw fail(400, 'Fill in the exact shipper, consignee and notify text first')

  const version = (booking.blDrafts || []).length + 1
  booking.blDrafts.push({ version, sentAt: new Date(), by: user?._id || user?.id, note: note ? String(note).trim() : undefined })
  booking.blDraftVersion = `v${version}`
  booking.draftSentToClientDate = new Date()
  // a new draft always restarts the approval (BR-4.4)
  booking.clientConfirmationStatus = 'Pending'
  booking.approvedAt = undefined
  booking.approvedBy = undefined
  booking.documents.push({ kind: 'draft-hbl', version, at: new Date(), by: user?._id || user?.id })
  await booking.save()
  return booking
}

// ─── Step 5 ──────────────────────────────────────────────────────────────────
const nextHblNumber = async (booking) => {
  const nvocc = booking.nvocc ? await Nvocc.findById(booking.nvocc).select('hblPrefix').lean() : null
  const prefix = (nvocc?.hblPrefix || 'HBL').toUpperCase()
  const yy = String(new Date().getFullYear()).slice(2)
  const counter = await JobCounter.findOneAndUpdate({ _id: `hbl-${prefix}-${yy}` }, { $inc: { seq: 1 } }, { upsert: true, new: true })
  return `${prefix}${yy}${String(counter.seq).padStart(5, '0')}`
}

export const issueHbl = async (id, user) => {
  const booking = await loadBooking(id)
  if (booking.status === 'cancelled') throw fail(400, 'A cancelled booking cannot be issued')
  if (isIssued(booking)) throw fail(400, 'The HBL has already been issued')
  for (const s of [1, 2, 3, 4]) if (!isStepComplete(booking, s)) throw fail(400, `Complete Step ${s} before issuing the HBL`)
  if ((booking.reconfirmSteps || []).length) throw fail(400, `Re-confirm Step ${booking.reconfirmSteps.join(', ')} before issuing`)

  const ctx = await loadContext(booking)
  const issues = computeStepIssues(booking, ctx)[5]
  if (issues.length > 0) throw fail(400, `The HBL is not ready: ${issues.slice(0, 3).join('; ')}${issues.length > 3 ? ` (+${issues.length - 3} more)` : ''}`, { issues })

  if (booking.hblNumber) {
    const dup = await Booking.exists({ _id: { $ne: booking._id }, hblNumber: booking.hblNumber })
    if (dup) throw fail(409, `HBL number ${booking.hblNumber} is already used by another job`)
  } else {
    booking.hblNumber = await nextHblNumber(booking)
  }
  if (booking.mblNumber && booking.carrier) {
    const dup = await Booking.exists({ _id: { $ne: booking._id }, carrier: booking.carrier, mblNumber: booking.mblNumber })
    if (dup) throw fail(409, `MBL number ${booking.mblNumber} is already used by another job of this VO`)
  }

  const now = new Date()
  booking.hblVersion = (booking.hblVersion || 0) + 1
  booking.hblIssuedAt = now
  booking.hblIssuedBy = user?._id || user?.id
  booking.hblHistory.push({ number: booking.hblNumber, version: booking.hblVersion, issuedAt: now })
  booking.documents.push({ kind: 'hbl', version: booking.hblVersion, at: now, by: user?._id || user?.id })
  if (!booking.blReleaseDate && booking.blType !== 'Original 3/3') booking.blReleaseDate = now
  booking.stepsCompleted.push({ step: 5, completedAt: now, completedBy: user?._id || user?.id })
  await booking.save()
  // BR-5.3 — stock moves to Shipped: the units are now departed
  await Container.updateMany({ booking: booking._id }, { containerStatus: 'Departed' })
  return booking
}

export const reissueHbl = async (id, reason, user) => {
  const booking = await loadBooking(id)
  if (!isIssued(booking)) throw fail(400, 'The HBL has not been issued yet')
  if (!reason || String(reason).trim().length < 3) throw fail(400, 'A reason is required to re-issue the HBL')
  const last = booking.hblHistory[booking.hblHistory.length - 1]
  if (last) { last.replacedAt = new Date(); last.reason = String(reason).trim() }
  booking.hblIssuedAt = null
  booking.hblIssuedBy = null
  booking.stepsCompleted = booking.stepsCompleted.filter((s) => s.step !== 5)
  booking.amendments.push({ step: 5, reason: `Re-issue HBL: ${String(reason).trim()}`, by: user?._id || user?.id, at: new Date() })
  await booking.save()
  return booking
}

// ─── Pre-alert to the POD agent (D13) ────────────────────────────────────────
export const sendPreAlert = async (id, user) => {
  const booking = await Booking.findById(id).populate('pol pod', 'name code').populate('carrier', 'name')
  if (!booking) throw fail(404, 'Booking not found')
  if (!isIssued(booking)) throw fail(400, 'Issue the HBL before sending the pre-alert')
  if (!String(booking.mblNumber || '').trim()) throw fail(400, 'Enter the MBL number before sending the pre-alert')
  if (!String(booking.mblShipper || '').trim() || !String(booking.mblConsignee || '').trim()) throw fail(400, 'Enter the MBL shipper and consignee before sending the pre-alert')

  const agent = booking.podAgentRef ? await Agent.findById(booking.podAgentRef).select('contacts name').lean() : null
  const recipients = [...new Set([...(agent?.contacts || []).map((c) => c.email), booking.podAgent?.email].map((e) => String(e || '').trim().toLowerCase()).filter(Boolean))]
  if (recipients.length === 0) throw fail(400, 'The POD agent has no e-mail address to send the pre-alert to')

  const units = await Container.find({ booking: booking._id }).populate('containerType', 'code').sort({ createdAt: 1 }).lean()
  const html = `
    <p>Pre-alert — HBL <strong>${booking.hblNumber}</strong> (MBL ${booking.mblNumber})</p>
    <p>Vessel ${booking.vesselName || '-'} / voyage ${booking.voyageNo || '-'} — ${booking.pol?.name || ''} → ${booking.pod?.name || ''}<br/>
    ETD ${booking.etd ? new Date(booking.etd).toISOString().slice(0, 10) : '-'} · ETA ${booking.eta ? new Date(booking.eta).toISOString().slice(0, 10) : '-'}<br/>
    Freight: ${booking.freightTermsOnBL || '-'}</p>
    <p>Containers:</p>
    <ul>${units.map((u) => `<li>${u.containerNumber} (${u.containerType?.code || ''}) — seal ${u.sealNumber || '-'}</li>`).join('')}</ul>
    ${booking.isDangerous ? `<p><strong>Dangerous goods:</strong> UN ${String(booking.unNumber || '').replace(/^UN/i, '')}, class ${booking.dangerousClass || ''} — see the DG manifest.</p>` : ''}
  `
  for (const to of recipients) await sendPreAlertEmail({ to, subject: `Pre-alert ${booking.hblNumber} — ${booking.vesselName || ''}`, html })

  booking.preAlerts.push({ sentAt: new Date(), by: user?._id || user?.id, recipients })
  booking.preAlertSent = true
  await booking.save()
  return booking
}

export const ackPreAlert = async (id) => {
  const booking = await loadBooking(id)
  const open = [...(booking.preAlerts || [])].reverse().find((p) => !p.acknowledgedAt)
  if (!open) throw fail(400, 'There is no pre-alert waiting for an acknowledgement')
  open.acknowledgedAt = new Date()
  await booking.save()
  return booking
}

// ─── Document data ───────────────────────────────────────────────────────────
export const getDocumentData = async (id) => {
  const booking = await Booking.findById(id)
    .populate('pol pod', 'name code country')
    .populate('nvocc', 'name code')
    .populate('containers.containerType', 'code label')
  if (!booking) throw fail(404, 'Booking not found')
  const units = await Container.find({ booking: booking._id })
    .populate('containerType', 'code label tareWeightKg')
    .sort({ createdAt: 1 })
    .lean()
  return { booking, units }
}

// Enable conditions of the Step 5 actions, with the reason when disabled (shown in the UI).
export const getActionStates = async (id) => {
  const booking = await loadBooking(id)
  const ctx = await loadContext(booking)
  const units = ctx.units
  const issues = computeStepIssues(booking, ctx)
  const cyPassed = booking.cyGateInCutoff && new Date(booking.cyGateInCutoff).getTime() < Date.now()
  const loadingReady = units.length > 0 && units.every((u) => u.sealNumber && u.vgmWeightKg && (u.gateInDate || cyPassed))
  const preSteps = [1, 2, 3, 4]
  const stepsOk = preSteps.every((s) => isStepComplete(booking, s))
  const hold = releaseHold(booking)
  return {
    loadingList: loadingReady ? { enabled: true } : { enabled: false, reason: 'Every container needs a seal, a VGM and a gate-in date (or the CY cut-off must have passed)' },
    dgManifest: !booking.isDangerous ? { enabled: false, reason: 'This job has no dangerous goods' }
      : isStepComplete(booking, 3) ? { enabled: true } : { enabled: false, reason: 'Complete Step 3 first' },
    issueHbl: isIssued(booking) ? { enabled: false, reason: 'Already issued' }
      : !stepsOk ? { enabled: false, reason: 'Complete Steps 1 to 4 first' }
      : issues[5].length ? { enabled: false, reason: issues[5][0] } : { enabled: true },
    reissueHbl: isIssued(booking) ? { enabled: true } : { enabled: false, reason: 'The HBL has not been issued' },
    preAlert: !isIssued(booking) ? { enabled: false, reason: 'Issue the HBL first' }
      : !booking.mblNumber ? { enabled: false, reason: 'Enter the MBL number' }
      : !booking.mblShipper || !booking.mblConsignee ? { enabled: false, reason: 'Enter the MBL shipper and consignee' } : { enabled: true },
    releaseHold: hold,
  }
}
