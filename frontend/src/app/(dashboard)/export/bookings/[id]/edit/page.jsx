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
import BookingForm from '@/components/export/BookingForm'

export default function BookingEditPage() {
  const { id } = useParams()
  const toast = useToast()
  const { permissions } = useAuth()
  const canUpdate = permissions.includes('booking:update')
  const [booking, setBooking] = useState(null)
  const [ports, setPorts] = useState([])
  const [carriers, setCarriers] = useState([])
  const [nvoccs, setNvoccs] = useState([])
  const [depots, setDepots] = useState([])
  const [containerTypes, setContainerTypes] = useState([])
  const [stockMap, setStockMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const load = () => {
    Promise.all([
      bookingApi.getBookingById(id),
      masterDataApi.getPorts(),
      masterDataApi.getCarriers(),
      masterDataApi.getNvoccs(),
      masterDataApi.getDepots(),
      masterDataApi.getContainerTypes(),
      stockApi.getStockMapByType(),
    ])
      .then(([bookingRes, portsRes, carriersRes, nvoccsRes, depotsRes, typesRes, map]) => {
        setBooking(bookingRes)
        setPorts(portsRes)
        setCarriers(carriersRes)
        setNvoccs(nvoccsRes)
        setDepots(depotsRes)
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

  const handleSave = async (data) => {
    setSaving(true)
    try {
      const res = await bookingApi.updateBooking(id, data)
      setBooking(res.data)
      if (res.warnings) toast(res.warnings.message, 'error')
      toast('Booking saved', 'success')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
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
        <p className="mt-1.5 text-sm text-muted">Edit job / booking</p>
      </div>

      {!canUpdate ? (
        <EmptyState title="Not authorized" message="You don't have permission to edit bookings." />
      ) : (
        <BookingForm
          key={booking.updatedAt}
          booking={booking}
          ports={ports}
          carriers={carriers}
          nvoccs={nvoccs}
          depots={depots}
          containerTypes={containerTypes}
          stockMap={stockMap}
          submitting={saving}
          confirming={confirming}
          cancelling={cancelling}
          canUpdate={canUpdate}
          onSubmit={handleSave}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </div>
  )
}
