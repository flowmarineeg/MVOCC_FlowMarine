'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { FaArrowLeft, FaTimes, FaExclamationTriangle } from 'react-icons/fa'
import * as quotationApi from '@/services/quotation'
import * as masterDataApi from '@/services/masterData'
import * as teamApi from '@/services/team'
import { PageLoader } from '@/components/ui/Spinner'
import Badge from '@/components/ui/Badge'
import Plate from '@/components/ui/Plate'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'
import QuotationForm from '@/components/export/QuotationForm'

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
}

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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-ink/60" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.15 }}
            className="relative z-10 w-full max-w-md border border-brick/40 bg-card p-6 shadow-[4px_4px_0_0_var(--color-ink)]"
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

  const [quotation, setQuotation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)

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
      permissions.includes('team:read')
        ? teamApi.getMembers({ status: 'active', limit: 100 }).then((r) => r.members).catch(() => [])
        : Promise.resolve([]),
    ])
      .then(([q, customersRes, portsRes, typesRes, nvoccsRes, membersRes]) => {
        setQuotation(q)
        setCustomers(customersRes)
        setPorts(portsRes)
        setContainerTypes(typesRes)
        setNvoccs(nvoccsRes)
        setTeamMembers(membersRes)
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleSave = async (data) => {
    setSaving(true)
    try {
      await quotationApi.updateQuotation(id, data)
      toast('Quotation updated', 'success')
      load()
    } catch (err) {
      toast(err.message, 'error')
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

  const handleConvert = () => {
    router.push(`/export/bookings/new?fromQuotation=${id}`)
  }

  if (loading) return <div className="p-6"><PageLoader /></div>
  if (!quotation) return null

  const nextActions = NEXT_STATUS[quotation.status] || []

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
        {canUpdate && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {nextActions.map((a) => {
              const disabled = statusBusy || (a.status === 'approved' && quotation.belowMinMargin && !canApprove)
              return (
                <button
                  key={a.status}
                  onClick={() => (a.status === 'rejected' ? setRejectOpen(true) : changeStatus(a.status))}
                  disabled={disabled}
                  title={disabled ? 'Below minimum margin — requires quotation:approve permission' : undefined}
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
                  className="bg-stamp px-4 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-stamp/90"
                >
                  Convert to Job & Create Booking
                </button>
              )
            )}
          </div>
        )}
      </div>

      {quotation.status === 'rejected' && quotation.rejectionReason && (
        <div className="flex items-start gap-2 border border-brick/40 bg-brick/5 px-4 py-3 text-sm text-brick">
          <FaExclamationTriangle className="mt-0.5 shrink-0 text-xs" />
          <span><strong>Rejected:</strong> {quotation.rejectionReason}</span>
        </div>
      )}

      <QuotationForm
        quotation={quotation}
        customers={customers}
        ports={ports}
        containerTypes={containerTypes}
        nvoccs={nvoccs}
        currentUser={user}
        teamMembers={teamMembers}
        submitting={saving}
        canOverrideLock={canApprove}
        onSubmit={handleSave}
        onCustomerCreated={(c) => setCustomers((prev) => [...prev, c])}
      />

      <RejectModal
        isOpen={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onConfirm={(reason) => changeStatus('rejected', { rejectionReason: reason })}
        loading={statusBusy}
      />
    </div>
  )
}
