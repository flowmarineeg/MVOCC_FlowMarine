'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { FaArrowLeft, FaEdit } from 'react-icons/fa'
import * as bookingApi from '@/services/exportBooking'
import { PageLoader } from '@/components/ui/Spinner'
import Badge from '@/components/ui/Badge'
import Plate from '@/components/ui/Plate'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '—')

function Row({ label, value }) {
  return (
    <div>
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className="mt-0.5 text-sm text-ink">{value ?? '—'}</p>
    </div>
  )
}

function Section({ title, index, children, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
      className="border border-ink/15 bg-card"
    >
      <div className="border-t-[3px] border-rust" />
      <div className="p-5">
        <h3 className="mb-4 flex items-center gap-2 font-display text-base font-bold uppercase tracking-wide text-ink">
          <span className="font-mono text-xs font-normal tracking-normal text-rust">{index}</span>
          {title}
        </h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
      </div>
    </motion.div>
  )
}

export default function BookingDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const toast = useToast()
  const { permissions } = useAuth()
  const canUpdate = permissions.includes('booking:update')
  const [booking, setBooking] = useState(null)
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)

  const load = () => {
    bookingApi
      .getBookingById(id)
      .then(setBooking)
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleConfirm = async () => {
    setConfirming(true)
    try {
      await bookingApi.confirmBooking(id)
      toast('Booking confirmed', 'success')
      setConfirmOpen(false)
      load()
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
      load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setCancelling(false)
    }
  }

  if (loading) return <div className="p-6"><PageLoader /></div>
  if (!booking) return null

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-4 border-b border-line pb-5 sm:flex-row sm:items-end">
        <div>
          <Link href="/export/bookings" className="mb-2 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink">
            <FaArrowLeft className="text-xs" /> Back to bookings
          </Link>
          <div className="flex items-center gap-3">
            <Plate className="text-sm">{booking.jobNo}</Plate>
            <Badge value={booking.status} />
          </div>
          <p className="mt-1.5 text-sm text-muted">{booking.clientName}</p>
        </div>
        <div className="flex items-center gap-2">
          {canUpdate && booking.status !== 'cancelled' && (
            <Link
              href={`/export/bookings/${id}/step2`}
              className="flex items-center gap-2 bg-rust px-4 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-rust-dark"
            >
              <FaEdit /> Edit Step 2
            </Link>
          )}
          {canUpdate && booking.status === 'pending' && (
            <button
              onClick={() => setConfirmOpen(true)}
              className="bg-stamp px-4 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-stamp/90"
            >
              Confirm
            </button>
          )}
          {canUpdate && booking.status !== 'cancelled' && (
            <button
              onClick={() => setCancelOpen(true)}
              className="border border-brick/40 px-4 py-2.5 text-sm font-medium text-brick transition-colors hover:bg-brick/5"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <Section title="Client Quotation" index="Step 01">
        <Row label="Job No" value={booking.jobNo} />
        <Row label="Client Name" value={booking.clientName} />
        <Row label="Client Phone" value={booking.clientPhone} />
        <Row label="Client Email" value={booking.clientEmail} />
        <Row label="POL" value={booking.pol ? `${booking.pol.code} — ${booking.pol.name}` : '—'} />
        <Row label="POD" value={booking.pod ? `${booking.pod.code} — ${booking.pod.name}` : '—'} />
        <Row label="B/L No" value={booking.blNo} />
        <Row label="Containers" value={booking.containers?.map((c) => `${c.containerType?.code || '?'} x${c.quantity}`).join(', ')} />
      </Section>

      <Section title="Operational Details" index="Step 02" delay={0.05}>
        <Row label="Price" value={booking.price} />
        <Row label="Cost" value={booking.cost} />
        <Row label="Free Time (Est.)" value={fmtDate(booking.freeTimeEstimated)} />
        <Row label="Free Time (Final)" value={fmtDate(booking.freeTimeFinal)} />
        <Row label="Gate In" value={fmtDate(booking.gateInDate)} />
        <Row label="Gate Out" value={fmtDate(booking.gateOutDate)} />
        <Row label="Container Location" value={booking.containerLocation} />
        <Row label="Shipper" value={booking.shipper} />
        <Row label="Consignee" value={booking.consignee} />
        <Row label="Main Vessel" value={booking.mainVessel ? `${booking.mainVessel.name} (${booking.mainVessel.code})` : '—'} />
        <Row label="Voyage No" value={booking.voyageNo} />
        <Row label="ETD" value={fmtDate(booking.etd)} />
        <Row label="ATD" value={fmtDate(booking.atd)} />
        <Row label="ETA" value={fmtDate(booking.eta)} />
        <Row label="ATA" value={fmtDate(booking.ata)} />
        <Row label="POL Agent" value={booking.polAgent?.name} />
        <Row label="POD Agent" value={booking.podAgent?.name} />
        <Row label="Manifest Status" value={<Badge value={booking.manifestStatus} />} />
        <Row label="Notes" value={booking.notes} />
      </Section>

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
    </div>
  )
}
