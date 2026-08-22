'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FaArrowLeft } from 'react-icons/fa'
import * as bookingApi from '@/services/exportBooking'
import * as masterDataApi from '@/services/masterData'
import * as stockApi from '@/services/stock'
import { PageLoader } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'
import BookingFormStep1 from '@/components/export/BookingFormStep1'

export default function NewBookingPage() {
  const router = useRouter()
  const toast = useToast()
  const { permissions } = useAuth()
  const canCreate = permissions.includes('booking:create')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [ports, setPorts] = useState([])
  const [containerTypes, setContainerTypes] = useState([])
  const [stockMap, setStockMap] = useState({})

  useEffect(() => {
    Promise.all([masterDataApi.getPorts(), masterDataApi.getContainerTypes(), stockApi.getStockMapByType()])
      .then(([portsRes, typesRes, map]) => {
        setPorts(portsRes)
        setContainerTypes(typesRes)
        setStockMap(map)
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (data) => {
    setSubmitting(true)
    try {
      const res = await bookingApi.createBooking(data)
      if (res.warnings) {
        toast(res.warnings.message, 'error')
      }
      toast(`Booking ${res.data.jobNo} created`, 'success')
      router.push('/export/bookings')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="border-b border-line pb-5">
        <Link href="/export/bookings" className="mb-2 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink">
          <FaArrowLeft className="text-xs" /> Back to bookings
        </Link>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-rust">Step 01 of 02</p>
        <h1 className="mt-1 font-display text-2xl font-bold uppercase tracking-wide text-ink">New Booking Request</h1>
        <p className="mt-1 text-sm text-muted">Client quotation — filed at first contact, enriched later</p>
      </div>

      {!canCreate ? (
        <EmptyState title="Not authorized" message="You don't have permission to create bookings." />
      ) : loading ? (
        <PageLoader />
      ) : (
        <div className="border border-ink/15 bg-card p-5 sm:p-6">
          <BookingFormStep1
            ports={ports}
            containerTypes={containerTypes}
            stockMap={stockMap}
            submitting={submitting}
            onSubmit={handleSubmit}
          />
        </div>
      )}
    </div>
  )
}
