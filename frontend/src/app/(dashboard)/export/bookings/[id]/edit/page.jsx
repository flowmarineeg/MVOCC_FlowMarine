'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { FaArrowLeft } from 'react-icons/fa'
import * as bookingApi from '@/services/exportBooking'
import * as masterDataApi from '@/services/masterData'
import * as stockApi from '@/services/stock'
import { PageLoader } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import Badge from '@/components/ui/Badge'
import Plate from '@/components/ui/Plate'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'
import BookingFormStep1 from '@/components/export/BookingFormStep1'
import BookingFormStep2 from '@/components/export/BookingFormStep2'

const TABS = [
  { key: 'step1', label: 'Step 1 — Client Quotation' },
  { key: 'step2', label: 'Step 2 — Operational Details' },
]

export default function BookingEditPage() {
  const { id } = useParams()
  const toast = useToast()
  const { permissions } = useAuth()
  const canUpdate = permissions.includes('booking:update')
  const [tab, setTab] = useState('step1')
  const [booking, setBooking] = useState(null)
  const [ports, setPorts] = useState([])
  const [carriers, setCarriers] = useState([])
  const [nvoccs, setNvoccs] = useState([])
  const [containerTypes, setContainerTypes] = useState([])
  const [stockMap, setStockMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingStep1, setSavingStep1] = useState(false)
  const [savingStep2, setSavingStep2] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const load = () => {
    Promise.all([
      bookingApi.getBookingById(id),
      masterDataApi.getPorts(),
      masterDataApi.getCarriers(),
      masterDataApi.getNvoccs(),
      masterDataApi.getContainerTypes(),
      stockApi.getStockMapByType(),
    ])
      .then(([bookingRes, portsRes, carriersRes, nvoccsRes, typesRes, map]) => {
        setBooking(bookingRes)
        setPorts(portsRes)
        setCarriers(carriersRes)
        setNvoccs(nvoccsRes)
        setContainerTypes(typesRes)
        setStockMap(map)
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleSaveStep1 = async (data) => {
    setSavingStep1(true)
    try {
      const res = await bookingApi.updateStep1(id, data)
      setBooking(res.data)
      if (res.warnings) toast(res.warnings.message, 'error')
      toast('Client quotation saved', 'success')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSavingStep1(false)
    }
  }

  const handleSaveStep2 = async (data) => {
    setSavingStep2(true)
    try {
      const updated = await bookingApi.updateStep2(id, data)
      setBooking(updated)
      toast('Operational details saved', 'success')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSavingStep2(false)
    }
  }

  const handleConfirm = async () => {
    setConfirming(true)
    try {
      const updated = await bookingApi.confirmBooking(id)
      setBooking(updated)
      toast('Booking confirmed', 'success')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setConfirming(false)
    }
  }

  const handleCancel = async () => {
    setCancelling(true)
    try {
      const updated = await bookingApi.cancelBooking(id)
      setBooking(updated)
      toast('Booking cancelled', 'success')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setCancelling(false)
    }
  }

  if (loading) return <div className="p-6"><PageLoader /></div>
  if (!booking) return null

  const isCancelled = booking.status === 'cancelled'

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="border-b border-line pb-5">
        <Link href={`/export/bookings/${id}`} className="mb-2 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink">
          <FaArrowLeft className="text-xs" /> Back to booking
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <Plate className="text-sm">{booking.jobNo}</Plate>
          <Badge value={booking.status} />
        </div>
        <p className="mt-1.5 text-sm text-muted">Edit booking</p>
      </div>

      {!canUpdate ? (
        <EmptyState title="Not authorized" message="You don't have permission to edit bookings." />
      ) : (
        <>
          <div className="flex flex-wrap gap-1 border-b border-line">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-[0.08em] transition-colors ${
                  tab === t.key ? 'border-b-2 border-rust text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'step1' ? (
            <fieldset disabled={isCancelled} className="disabled:opacity-60">
              <div className="border border-ink/15 bg-card p-5 sm:p-6">
                <BookingFormStep1
                  key={booking.updatedAt}
                  booking={booking}
                  ports={ports}
                  containerTypes={containerTypes}
                  stockMap={stockMap}
                  submitting={savingStep1}
                  onSubmit={handleSaveStep1}
                />
              </div>
            </fieldset>
          ) : (
            <BookingFormStep2
              key={booking.updatedAt}
              booking={booking}
              carriers={carriers}
              nvoccs={nvoccs}
              containerTypes={containerTypes}
              stockMap={stockMap}
              saving={savingStep2}
              confirming={confirming}
              cancelling={cancelling}
              canUpdate={canUpdate}
              onSave={handleSaveStep2}
              onConfirm={handleConfirm}
              onCancel={handleCancel}
            />
          )}
        </>
      )}
    </div>
  )
}
