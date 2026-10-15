'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { FaArrowLeft, FaTimes, FaExclamationTriangle, FaFilePdf, FaCopy, FaRedo, FaTrash } from 'react-icons/fa'
import * as quotationApi from '@/services/quotation'
import * as masterDataApi from '@/services/masterData'
import * as teamApi from '@/services/team'
import { PageLoader } from '@/components/ui/Spinner'
import Badge from '@/components/ui/Badge'
import Plate from '@/components/ui/Plate'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'
import QuotationForm from '@/components/export/QuotationForm'
import DeleteQuotationModal from '@/components/export/DeleteQuotationModal'

const NEXT_STATUS = {
  draft: [{ status: 'sent', label: 'Send to Client', tone: 'rust' }],
  sent: [
    { status: 'negotiation', label: 'Move to Negotiation', tone: 'signal' },
    { status: 'approved', label: 'Approve', tone: 'stamp' },
    { status: 'rejected', label: 'Reject', tone: 'brick' },
  ],
  negotiation: [
    { status: 'sent', label: 'Back to Sent', tone: 'signal' },
    { status: 'approved', label: 'Approve', tone: 'stamp' },
    { status: 'rejected', label: 'Reject', tone: 'brick' },
  ],
  approved: [],
  rejected: [],
  expired: [],
}

// Whole days left until a date, counting that date itself (0 = valid until today).
const daysUntil = (iso) => Math.ceil((new Date(iso).getTime() + 24 * 3600 * 1000 - Date.now()) / (24 * 3600 * 1000))

const toneCls = {
  rust: 'bg-rust text-card hover:bg-rust-dark',
  stamp: 'bg-stamp text-card hover:bg-stamp/90',
  signal: 'border border-signal/50 text-signal hover:bg-signal/10',
  brick: 'border border-brick/40 text-brick hover:bg-brick/5',
}

function RejectModal({ isOpen, onClose, onConfirm, loading }) {
  const [reason, setReason] = useState('')
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-ink/40" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.15 }}
            className="relative z-10 w-full max-w-md border border-brick/40 bg-card p-6 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold uppercase tracking-wide text-ink">Reject this quotation?</h3>
              <button onClick={onClose} className="text-muted transition-colors hover:text-ink"><FaTimes /></button>
            </div>
            <label className="mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
              Rejection Reason <span className="text-rust">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full border border-ink/30 bg-paper px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust"
              placeholder="Price / transit time / other reason"
            />
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={onClose} disabled={loading} className="border border-ink/30 px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-ink/5 disabled:opacity-50">Cancel</button>
              <button
                onClick={() => reason.trim() && onConfirm(reason.trim())}
                disabled={loading || !reason.trim()}
                className="bg-brick px-4 py-2 text-sm font-semibold text-card transition-colors hover:bg-brick/90 disabled:opacity-50"
              >
                {loading ? 'Processing…' : 'Reject Quotation'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default function QuotationDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const toast = useToast()
  const { permissions, user } = useAuth()
  const canUpdate = permissions.includes('quotation:update')
  const canApprove = permissions.includes('quotation:approve')
  const canCreate = permissions.includes('quotation:create')

  const [quotation, setQuotation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [vesselOperators, setVesselOperators] = useState([])

  const [customers, setCustomers] = useState([])
  const [ports, setPorts] = useState([])
  const [containerTypes, setContainerTypes] = useState([])
  const [nvoccs, setNvoccs] = useState([])
  const [teamMembers, setTeamMembers] = useState([])

  const load = () => {
    quotationApi.getQuotationById(id).then(setQuotation).catch((err) => toast(err.message, 'error'))
  }

  useEffect(() => {
    Promise.all([
      quotationApi.getQuotationById(id),
      masterDataApi.getCustomers(),
      masterDataApi.getPorts(),
      masterDataApi.getContainerTypes(),
      masterDataApi.getNvoccs(),
      masterDataApi.getVesselOperators().catch(() => []),
      permissions.includes('team:read')
        ? teamApi.getMembers({ status: 'active', limit: 100 }).then((r) => r.members).catch(() => [])
        : Promise.resolve([]),
    ])
      .then(([q, customersRes, portsRes, typesRes, nvoccsRes, vosRes, membersRes]) => {
        setQuotation(q)
        setCustomers(customersRes)
        setPorts(portsRes)
        setContainerTypes(typesRes)
        setNvoccs(nvoccsRes)
        setVesselOperators(vosRes)
        setTeamMembers(membersRes)
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Sections 1–4 ("main") and 5–8 ("pricing") are saved by separate buttons —
  // same document, each call only carries its own part's fields. The form keeps
  // its own state, so saving one part never discards unsaved edits in the other.
  // Returns the saved quotation (so the form can refresh its MSDS list).
  const handleSavePart = async (part, data, msdsFiles = []) => {
    setSaving(true)
    try {
      let updated = await quotationApi.updateQuotation(id, data)
      if (msdsFiles.length > 0) {
        try {
          updated = await quotationApi.uploadMsds(id, msdsFiles)
        } catch (err) {
          toast(`Saved, but the MSDS upload failed: ${err.message}`, 'error')
          setQuotation(updated)
          return updated
        }
      }
      setQuotation(updated)
      toast(part === 'main' ? 'Sections 1–4 saved' : 'Sections 5–8 saved', 'success')
      return updated
    } catch (err) {
      toast(err.message, 'error')
      return undefined
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (status, extra = {}) => {
    setStatusBusy(true)
    try {
      await quotationApi.updateStatus(id, { status, ...extra })
      toast(`Quotation moved to ${status}`, 'success')
      setRejectOpen(false)
      load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setStatusBusy(false)
    }
  }

  // Revise: a new -R<n> draft that supersedes this quotation. Duplicate: a fresh FQ number.
  const copyAction = (fn, doneMessage) => async () => {
    setStatusBusy(true)
    try {
      const created = await fn(id)
      toast(`${doneMessage} ${created.quotationNo}`, 'success')
      router.push(`/export/quotations/${created._id}`)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setStatusBusy(false)
    }
  }
  const handleRevise = copyAction(quotationApi.reviseQuotation, 'Created revision')
  const handleDuplicate = copyAction(quotationApi.duplicateQuotation, 'Duplicated as')
  const handlePdf = () => quotationApi.downloadPdf(quotation).catch((err) => toast(err.message, 'error'))

  const handleConvert = () => {
    router.push(`/export/bookings/new?fromQuotation=${id}`)
  }

  if (loading) return <div className="p-6"><PageLoader /></div>
  if (!quotation) return null

  const nextActions = quotation.revisedTo ? [] : NEXT_STATUS[quotation.status] || []
  const canRevise = canUpdate && !quotation.revisedTo && ['sent', 'negotiation', 'rejected', 'expired'].includes(quotation.status)
  // Days until the validity date (inclusive) for a quotation that is still out with the client.
  const daysLeft = quotation.validityDate && ['sent', 'negotiation'].includes(quotation.status) ? daysUntil(quotation.validityDate) : null
  // What is still missing before this quotation can be sent / approved / converted
  // (computed by the server from the SAVED data).
  const issues = quotation.readinessIssues || []
  const needsReadiness = !quotation.revisedTo && (['draft', 'sent', 'negotiation'].includes(quotation.status) || (quotation.status === 'approved' && !quotation.linkedBooking))
  const notReadyTitle = `Not ready — complete the items listed below and save first`

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-4 border-b border-line pb-5 sm:flex-row sm:items-end">
        <div>
          <Link href="/export/quotations" className="mb-2 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink">
            <FaArrowLeft className="text-xs" /> Back to quotations
          </Link>
          <div className="flex items-center gap-3">
            <Plate className="text-sm">{quotation.quotationNo}</Plate>
            <Badge value={quotation.linkedBooking ? 'job_created' : quotation.status} />
          </div>
          <p className="mt-1.5 text-sm text-muted">{quotation.clientName}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button onClick={handlePdf} className="flex items-center gap-2 border border-ink/30 px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-ink/5">
            <FaFilePdf className="text-xs" /> Download PDF
          </button>
          {canCreate && (
            <button onClick={handleDuplicate} disabled={statusBusy} className="flex items-center gap-2 border border-ink/30 px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-ink/5 disabled:opacity-40">
              <FaCopy className="text-xs" /> Duplicate
            </button>
          )}
          {canUpdate && (
            <button onClick={() => setDeleteOpen(true)} disabled={statusBusy} className="flex items-center gap-2 border border-brick/40 px-4 py-2.5 text-sm font-semibold text-brick transition-colors hover:bg-brick/5 disabled:opacity-40">
              <FaTrash className="text-xs" /> Delete
            </button>
          )}
          {canRevise && (
            <button onClick={handleRevise} disabled={statusBusy} className="flex items-center gap-2 border border-signal/50 px-4 py-2.5 text-sm font-semibold text-signal transition-colors hover:bg-signal/10 disabled:opacity-40">
              <FaRedo className="text-xs" /> Revise
            </button>
          )}
        </div>
        {canUpdate && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {nextActions.map((a) => {
              const notReady = issues.length > 0 && (a.status === 'sent' || a.status === 'approved')
              const disabled = statusBusy || notReady || (a.status === 'approved' && quotation.belowMinMargin && !canApprove)
              return (
                <button
                  key={a.status}
                  onClick={() => (a.status === 'rejected' ? setRejectOpen(true) : changeStatus(a.status))}
                  disabled={disabled}
                  title={notReady ? notReadyTitle : disabled ? 'Below minimum margin — requires quotation:approve permission' : undefined}
                  className={`px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${toneCls[a.tone]}`}
                >
                  {a.label}
                </button>
              )
            })}
            {quotation.status === 'approved' && (
              quotation.linkedBooking ? (
                <Link
                  href={`/export/bookings/${quotation.linkedBooking._id}`}
                  className="bg-ink px-4 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-ink/85"
                >
                  View Booking {quotation.linkedBooking.jobNo}
                </Link>
              ) : (
                <button
                  onClick={handleConvert}
                  disabled={issues.length > 0}
                  title={issues.length > 0 ? notReadyTitle : undefined}
                  className="bg-stamp px-4 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-stamp/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Convert to Job & Create Booking
                </button>
              )
            )}
          </div>
        )}
      </div>

      {quotation.revisedTo && (
        <div data-testid="superseded" className="border border-signal/40 bg-signal/10 px-4 py-3 text-sm text-signal">
          This quotation was replaced by a newer revision:{' '}
          <Link href={`/export/quotations/${quotation.revisedTo._id}`} className="font-semibold underline">{quotation.revisedTo.quotationNo}</Link>. It is kept for history and can no longer be edited.
        </div>
      )}
      {quotation.revisedFrom && (
        <p className="font-mono text-xs text-muted">
          Revision of <Link href={`/export/quotations/${quotation.revisedFrom._id}`} className="text-rust hover:text-rust-dark">{quotation.revisedFrom.quotationNo}</Link>
        </p>
      )}
      {quotation.status === 'expired' && (
        <div data-testid="expired" className="flex items-start gap-2 border border-brick/40 bg-brick/5 px-4 py-3 text-sm text-brick">
          <FaExclamationTriangle className="mt-0.5 shrink-0 text-xs" />
          <span><strong>Expired:</strong> the validity date has passed. Revise this quotation to send a new offer.</span>
        </div>
      )}
      {daysLeft !== null && daysLeft <= 2 && (
        <div data-testid="expiring" className="border border-signal/40 bg-signal/10 px-4 py-3 text-sm text-signal">
          {daysLeft <= 0 ? 'This quotation is valid until today.' : `This quotation expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`}
        </div>
      )}
      {(quotation.warnings || []).length > 0 && (
        <div data-testid="warnings" className="border border-signal/40 bg-signal/10 px-4 py-3 text-sm text-signal">
          <ul className="list-disc space-y-0.5 pl-5">{quotation.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}

      {quotation.status === 'rejected' && quotation.rejectionReason && (
        <div className="flex items-start gap-2 border border-brick/40 bg-brick/5 px-4 py-3 text-sm text-brick">
          <FaExclamationTriangle className="mt-0.5 shrink-0 text-xs" />
          <span><strong>Rejected:</strong> {quotation.rejectionReason}</span>
        </div>
      )}

      {needsReadiness && issues.length > 0 && (
        <div data-testid="readiness" className="border border-signal/40 bg-signal/10 px-4 py-3 text-sm text-signal">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em]">
            Complete before this quotation can be sent, approved or converted to a job
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {issues.map((i) => <li key={i}>{i}</li>)}
          </ul>
          <p className="mt-1.5 text-xs opacity-80">Based on what is saved — save sections 1–4 and 5–8 after filling them in.</p>
        </div>
      )}

      <QuotationForm
        quotation={quotation}
        customers={customers}
        ports={ports}
        containerTypes={containerTypes}
        nvoccs={nvoccs}
        vesselOperators={vesselOperators}
        currentUser={user}
        teamMembers={teamMembers}
        submitting={saving}
        canOverrideLock={canApprove}
        onSavePart={handleSavePart}
        onCustomerCreated={(c) => setCustomers((prev) => [...prev, c])}
      />

      {deleteOpen && (
        <DeleteQuotationModal quotation={quotation} onClose={() => setDeleteOpen(false)} onDeleted={() => router.push('/export/quotations')} />
      )}

      <RejectModal
        isOpen={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onConfirm={(reason) => changeStatus('rejected', { rejectionReason: reason })}
        loading={statusBusy}
      />
    </div>
  )
}
