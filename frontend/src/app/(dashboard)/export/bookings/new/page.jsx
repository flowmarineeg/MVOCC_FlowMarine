'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { FaArrowLeft } from 'react-icons/fa'
import * as bookingApi from '@/services/exportBooking'
import * as masterDataApi from '@/services/masterData'
import * as stockApi from '@/services/stock'
import * as quotationApi from '@/services/quotation'
import { PageLoader } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'
import BookingForm from '@/components/export/BookingForm'
import BookingStepBar from '@/components/export/BookingStepBar'

// Builds BookingForm's `prefill` shape from an approved Quotation, for the
// "Convert to Job & Create Booking" flow — only the fields that overlap
// between the two documents are carried over (see Sprint 005 plan, Explicit
// Decisions 5 & 6: VGM is deliberately NOT auto-filled). NVOCC/pricing are
// now part of this same one-page submission instead of a second chained
// Step 2 call, since the Job form no longer has separate steps.
function prefillFromQuotation(quotation) {
  return {
    clientName: quotation.clientName || '',
    clientPhone: quotation.contactPhone || '',
    clientEmail: quotation.contactEmail || '',
    pol: quotation.pol?._id || quotation.pol || '',
    pod: quotation.pod?._id || quotation.pod || '',
    commodity: quotation.commodity || '',
    isDangerous: !!quotation.isDangerous,
    dangerousNumber: quotation.isDangerous ? `${quotation.unClass || ''} ${quotation.unNumber || ''}`.trim() : '',
    containers: (quotation.containers || []).map((c) => ({
      containerType: c.containerType?._id || c.containerType,
      quantity: c.quantity,
    })),
    nvocc: quotation.nvocc?._id || quotation.nvocc || '',
    price: quotation.totalSellingPrice || '',
    cost: quotation.totalBuyingCost || '',
  }
}

// useSearchParams() requires a Suspense boundary above it in production
// builds (Next.js throws "Missing Suspense boundary" otherwise) — see
// node_modules/next/dist/docs/.../use-search-params.md.
export default function NewBookingPage() {
  return (
    <Suspense fallback={<div className="p-6"><PageLoader /></div>}>
      <NewBookingPageInner />
    </Suspense>
  )
}

function NewBookingPageInner() {
  const router = useRouter()
  const toast = useToast()
  const searchParams = useSearchParams()
  const fromQuotationId = searchParams.get('fromQuotation')
  const { permissions } = useAuth()
  const canCreate = permissions.includes('booking:create')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [ports, setPorts] = useState([])
  const [containerTypes, setContainerTypes] = useState([])
  const [carriers, setCarriers] = useState([])
  const [nvoccs, setNvoccs] = useState([])
  const [depots, setDepots] = useState([])
  const [stockMap, setStockMap] = useState({})
  const [quotation, setQuotation] = useState(null)
  const [step, setStep] = useState(1)

  useEffect(() => {
    Promise.all([
      masterDataApi.getPorts(),
      masterDataApi.getContainerTypes(),
      masterDataApi.getCarriers(),
      masterDataApi.getNvoccs(),
      masterDataApi.getDepots(),
      stockApi.getStockMapByType(),
      fromQuotationId ? quotationApi.getQuotationById(fromQuotationId) : Promise.resolve(null),
    ])
      .then(([portsRes, typesRes, carriersRes, nvoccsRes, depotsRes, map, quotationRes]) => {
        setPorts(portsRes)
        setContainerTypes(typesRes)
        setCarriers(carriersRes)
        setNvoccs(nvoccsRes)
        setDepots(depotsRes)
        setStockMap(map)
        setQuotation(quotationRes)
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromQuotationId])

  const handleSubmit = async (data) => {
    setSubmitting(true)
    try {
      const res = await bookingApi.createBooking(data)
      if (res.warnings) {
        toast(res.warnings.message, 'error')
      }
      toast(`Booking ${res.data.jobNo} created`, 'success')
      router.push(`/export/bookings/${res.data._id}`)
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
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-rust">Booking &amp; Job</p>
        <h1 className="mt-1 font-display text-2xl font-bold uppercase tracking-wide text-ink">New Job / Booking</h1>
        <p className="mt-1 text-sm text-muted">
          {quotation ? `Converting quotation ${quotation.quotationNo} — review and file the job` : 'Client request through carrier booking, customs, and containers — one screen'}
        </p>
      </div>

      {!canCreate ? (
        <EmptyState title="Not authorized" message="You don't have permission to create bookings." />
      ) : loading ? (
        <PageLoader />
      ) : (
        <>
        <BookingStepBar active={step} onChange={setStep} />
        {(step === 4 || step === 5) && (
          <p className="border border-dashed border-ink/30 bg-paper/40 p-4 text-sm text-muted">
            {step === 4 ? 'Customs Certificate' : 'BL & Loading List'} details unlock once the job is created — fill in what you have here, then save.
          </p>
        )}
        <BookingForm
          activeStep={step}
          onInvalidStep={setStep}
          prefill={quotation ? prefillFromQuotation(quotation) : null}
          quotationId={quotation?._id || null}
          ports={ports}
          containerTypes={containerTypes}
          carriers={carriers}
          nvoccs={nvoccs}
          depots={depots}
          stockMap={stockMap}
          submitting={submitting}
          onSubmit={handleSubmit}
        />
        </>
      )}
    </div>
  )
}
