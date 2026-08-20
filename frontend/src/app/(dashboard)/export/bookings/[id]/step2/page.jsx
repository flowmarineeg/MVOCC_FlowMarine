'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { FaArrowLeft } from 'react-icons/fa'
import * as bookingApi from '@/services/exportBooking'
import * as masterDataApi from '@/services/masterData'
import { PageLoader } from '@/components/ui/Spinner'
import Badge from '@/components/ui/Badge'
import Plate from '@/components/ui/Plate'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'
import BookingFormStep2 from '@/components/export/BookingFormStep2'

export default function BookingStep2Page() {
  const { id } = useParams()
  const toast = useToast()
  const { permissions } = useAuth()
  const canUpdate = permissions.includes('booking:update')
  const [booking, setBooking] = useState(null)
  const [vessels, setVessels] = useState([])
  const [agents, setAgents] = useState([])
  const [containerTypes, setContainerTypes] = useState([])
  const [stockMap, setStockMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const load = () => {
    Promise.all([
      bookingApi.getBookingById(id),
      masterDataApi.getVessels(),
      masterDataApi.getAgents(),
      masterDataApi.getContainerTypes(),
      masterDataApi.getContainerStock(),
    ])
      .then(([bookingRes, vesselsRes, agentsRes, typesRes, stockRes]) => {
        setBooking(bookingRes)
        setVessels(vesselsRes)
        setAgents(agentsRes)
        setContainerTypes(typesRes)
        const map = {}
        stockRes.forEach((s) => {
          const typeId = s.containerType?._id || s.containerType
          map[typeId] = s.availableCount
        })
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
      const updated = await bookingApi.updateStep2(id, data)
      setBooking(updated)
      toast('Operational details saved', 'success')
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
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-rust">Step 02 of 02</p>
        <div className="mt-1 flex items-center gap-3">
          <Plate className="text-sm">{booking.jobNo}</Plate>
          <Badge value={booking.status} />
        </div>
        <p className="mt-1.5 text-sm text-muted">Operational details entry</p>
      </div>

      <BookingFormStep2
        key={booking.updatedAt}
        booking={booking}
        vessels={vessels}
        agents={agents}
        containerTypes={containerTypes}
        stockMap={stockMap}
        saving={saving}
        confirming={confirming}
        cancelling={cancelling}
        canUpdate={canUpdate}
        onSave={handleSave}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  )
}
