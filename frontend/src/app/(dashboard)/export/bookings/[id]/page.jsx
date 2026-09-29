'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { FaArrowLeft, FaTrash } from 'react-icons/fa'
import * as bookingApi from '@/services/exportBooking'
import * as blApi from '@/services/bl'
import * as masterDataApi from '@/services/masterData'
import * as stockApi from '@/services/stock'
import { PageLoader } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import Badge from '@/components/ui/Badge'
import Plate from '@/components/ui/Plate'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'
import BookingForm from '@/components/export/BookingForm'
import BLForm from '@/components/export/BLForm'
import BookingStepBar from '@/components/export/BookingStepBar'

// Small inline notice for a step that mixes Booking-owned and B&L-owned
// content (Steps 4 & 5) when the viewer only holds one of the two
// permissions — the OTHER sub-block on that step still renders normally.
function MissingAccess({ label, permission }) {
  return (
    <div className="border border-dashed border-ink/30 bg-paper/40 p-5 text-sm text-muted">
      Not authorized to view <span className="font-semibold text-ink">{label}</span> — requires the{' '}
      <code className="font-mono text-xs text-ink">{permission}</code> permission.
    </div>
  )
}

export default function BookingDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const toast = useToast()
  const { permissions } = useAuth()
  const canReadBooking = permissions.includes('booking:read')
  const canUpdateBooking = permissions.includes('booking:update')
  const canReadBl = permissions.includes('bl:read')
  const canUpdateBl = permissions.includes('bl:update')
  const canViewQuotations = permissions.includes('quotation:read')

  const [bookingData, setBookingData] = useState(null)
  const [blData, setBlData] = useState(null)
  const [ports, setPorts] = useState([])
  const [carriers, setCarriers] = useState([])
  const [nvoccs, setNvoccs] = useState([])
  const [depots, setDepots] = useState([])
  const [containerTypes, setContainerTypes] = useState([])
  const [stockMap, setStockMap] = useState({})
  // Lazy-initialized from the (stable, permission-derived) "has neither
  // permission" case rather than set inside the effect below — calling
  // setState synchronously in an effect body for that branch would trigger
  // an avoidable extra render (react-hooks/set-state-in-effect).
  const [loading, setLoading] = useState(() => canReadBooking || canReadBl)
  const [step, setStep] = useState(null)

  const [savingBooking, setSavingBooking] = useState(false)
  const [savingBl, setSavingBl] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Drive BookingForm/BLForm's remount-on-save `key`s from two INDEPENDENT
  // counters, not from bookingData.updatedAt/blData.updatedAt — Booking and
  // B&L are the same MongoDB document, so its updatedAt changes on every
  // save regardless of which form caused it. Keying off the shared
  // timestamp would remount BOTH forms on every save, discarding whatever
  // unsaved edits a user had already typed into the OTHER form in the
  // moment before its own remount landed. Each generation only bumps for
  // the actions that actually change that side's fields.
  const [bookingGen, setBookingGen] = useState(0)
  const [blGen, setBlGen] = useState(0)

  // Refetch both projections after any save/confirm/cancel — a Booking-side
  // change (e.g. ATD) can affect what B&L's Step 5 closure checklist shows,
  // and vice versa isn't possible today but keeping both in sync is cheap
  // (one extra GET) and avoids any staleness.
  const reload = () =>
    Promise.all([
      canReadBooking ? bookingApi.getBookingById(id) : Promise.resolve(null),
      canReadBl ? blApi.getBlById(id) : Promise.resolve(null),
    ]).then(([b, bl]) => {
      setBookingData(b)
      setBlData(bl)
      return { b, bl }
    })

  useEffect(() => {
    if (!canReadBooking && !canReadBl) return // loading already starts false in this case
    Promise.all([
      reload(),
      canReadBooking ? masterDataApi.getPorts() : Promise.resolve([]),
      canReadBooking ? masterDataApi.getCarriers() : Promise.resolve([]),
      canReadBooking ? masterDataApi.getNvoccs() : Promise.resolve([]),
      canReadBooking ? masterDataApi.getDepots() : Promise.resolve([]),
      canReadBooking ? masterDataApi.getContainerTypes() : Promise.resolve([]),
      canReadBooking ? stockApi.getStockMapByType() : Promise.resolve({}),
    ])
      .then(([, portsRes, carriersRes, nvoccsRes, depotsRes, typesRes, map]) => {
        setPorts(portsRes)
        setCarriers(carriersRes)
        setNvoccs(nvoccsRes)
        setDepots(depotsRes)
        setContainerTypes(typesRes)
        setStockMap(map)
        setStep((s) => s ?? (canReadBooking ? 1 : 4))
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleSaveBooking = async (data) => {
    setSavingBooking(true)
    try {
      const res = await bookingApi.updateBooking(id, data)
      if (res.warnings) toast(res.warnings.message, 'error')
      toast('Booking details saved', 'success')
      await reload()
      setBookingGen((g) => g + 1)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSavingBooking(false)
    }
  }

  const handleSaveBl = async (data) => {
    setSavingBl(true)
    try {
      await blApi.updateBl(id, data)
      toast('B&L data saved', 'success')
      await reload()
      setBlGen((g) => g + 1)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSavingBl(false)
    }
  }

  const handleConfirm = async () => {
    setConfirming(true)
    try {
      await bookingApi.confirmBooking(id)
      toast('Booking confirmed', 'success')
      setConfirmOpen(false)
      await reload()
      setBookingGen((g) => g + 1)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setConfirming(false)
    }
  }

  const handleCancel = async () => {
    setCancelling(true)
    try {
      await bookingApi.cancelBooking(id)
      toast('Booking cancelled', 'success')
      setCancelOpen(false)
      await reload()
      setBookingGen((g) => g + 1)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setCancelling(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await bookingApi.deleteBooking(id)
      toast('Booking deleted', 'success')
      router.push('/export/bookings')
    } catch (err) {
      toast(err.message, 'error')
      setDeleting(false)
    }
  }

  if (!canReadBooking && !canReadBl) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState title="Not authorized" message="You don't have permission to view this job." />
      </div>
    )
  }
  if (loading) return <div className="p-6"><PageLoader /></div>
  if (!bookingData && !blData) return null

  // Header display falls back to the B&L-scoped context fields (jobNo,
  // clientName, jobStatus are all part of BL_CONTEXT_FIELDS) when the viewer
  // has no booking:read, so the header always populates for either role.
  const header = bookingData || blData
  const depotMissingForConfirm = bookingData && !bookingData.depot

  // Purely cosmetic per-step "completed" signal (see BookingStepBar) — never
  // gates navigation.
  const completed = {
    1: !!bookingData?.shippingDeclaration?.fileName,
    2: bookingData?.bookingConfirmationStatus === 'Issued',
    3: bookingData?.status === 'confirmed',
    4: !!blData?.certificateReceivedDate,
    5: !!blData?.dateOfIssue,
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-4 border-b border-line pb-5 sm:flex-row sm:items-end">
        <div>
          <Link href="/export/bookings" className="mb-2 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink">
            <FaArrowLeft className="text-xs" /> Back to bookings
          </Link>
          <div className="flex items-center gap-3">
            <Plate className="text-sm">{header.jobNo}</Plate>
            <Badge value={header.jobStatus} />
          </div>
          <p className="mt-1.5 text-sm text-muted">{header.clientName}</p>
        </div>
        {bookingData && canUpdateBooking && (
          <div className="flex items-center gap-2">
            {bookingData.status === 'pending' && (
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={depotMissingForConfirm}
                title={depotMissingForConfirm ? 'Select a depot in Step 3 (Depot / Container) first, then save, before confirming' : undefined}
                className="bg-stamp px-4 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-stamp/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Confirm
              </button>
            )}
            {bookingData.status !== 'cancelled' && (
              <button
                onClick={() => setCancelOpen(true)}
                className="border border-brick/40 px-4 py-2.5 text-sm font-medium text-brick transition-colors hover:bg-brick/5"
              >
                Cancel
              </button>
            )}
            {bookingData.status !== 'confirmed' && (
              <button
                onClick={() => setDeleteOpen(true)}
                title="Delete booking"
                className="flex h-10 w-10 items-center justify-center border border-brick/40 text-brick transition-colors hover:bg-brick/5"
              >
                <FaTrash className="text-sm" />
              </button>
            )}
          </div>
        )}
      </div>

      {bookingData?.quotation && (
        <p className="-mt-3 font-mono text-xs text-muted">
          From quotation:{' '}
          {canViewQuotations ? (
            <Link href={`/export/quotations/${bookingData.quotation._id}`} className="text-rust transition-colors hover:text-rust-dark">
              {bookingData.quotation.quotationNo}
            </Link>
          ) : (
            bookingData.quotation.quotationNo
          )}
        </p>
      )}

      <BookingStepBar active={step} onChange={setStep} completed={completed} />

      <div className="space-y-6">
        {bookingData ? (
          <BookingForm
            key={`booking-${bookingGen}`}
            booking={bookingData}
            activeStep={step}
            onInvalidStep={setStep}
            ports={ports}
            carriers={carriers}
            nvoccs={nvoccs}
            depots={depots}
            containerTypes={containerTypes}
            stockMap={stockMap}
            submitting={savingBooking}
            canUpdate={canUpdateBooking}
            onSubmit={handleSaveBooking}
          />
        ) : [1, 2, 3].includes(step) ? (
          <EmptyState title="Not authorized" message="You don't have permission to view Booking data." />
        ) : (
          <MissingAccess label={step === 4 ? 'Customs (Nafeza)' : 'Status & Notes'} permission="booking:read" />
        )}

        {(step === 4 || step === 5) &&
          (blData ? (
            <BLForm
              key={`bl-${blGen}`}
              booking={blData}
              activeStep={step}
              canUpdate={canUpdateBl}
              submitting={savingBl}
              onSubmit={handleSaveBl}
            />
          ) : (
            <MissingAccess label={step === 4 ? 'Customs Certificate' : 'BL & Loading List'} permission="bl:read" />
          ))}
      </div>

      {bookingData && (
        <>
          <Modal
            isOpen={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            onConfirm={handleConfirm}
            title="Confirm this booking?"
            message="This will lock the booking as confirmed and decrement container stock."
            confirmLabel="Confirm Booking"
            loading={confirming}
          />
          <Modal
            isOpen={cancelOpen}
            onClose={() => setCancelOpen(false)}
            onConfirm={handleCancel}
            title="Cancel this booking?"
            message="This will mark the booking as cancelled. If it was confirmed, stock will be restored."
            confirmLabel="Cancel Booking"
            danger
            loading={cancelling}
          />
          <Modal
            isOpen={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            onConfirm={handleDelete}
            title="Delete this booking?"
            message={`This will permanently delete booking ${bookingData.jobNo}. This cannot be undone.`}
            confirmLabel="Delete Booking"
            danger
            loading={deleting}
          />
        </>
      )}
    </div>
  )
}
