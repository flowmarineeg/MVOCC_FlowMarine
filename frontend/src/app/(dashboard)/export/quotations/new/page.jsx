'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FaArrowLeft } from 'react-icons/fa'
import * as quotationApi from '@/services/quotation'
import * as masterDataApi from '@/services/masterData'
import * as teamApi from '@/services/team'
import { PageLoader } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'
import QuotationForm from '@/components/export/QuotationForm'

export default function NewQuotationPage() {
  const router = useRouter()
  const toast = useToast()
  const { permissions, user } = useAuth()
  const canCreate = permissions.includes('quotation:create')
  const canSeeTeam = permissions.includes('team:read')

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [customers, setCustomers] = useState([])
  const [ports, setPorts] = useState([])
  const [containerTypes, setContainerTypes] = useState([])
  const [carriers, setCarriers] = useState([])
  const [teamMembers, setTeamMembers] = useState([])

  useEffect(() => {
    Promise.all([
      masterDataApi.getCustomers(),
      masterDataApi.getPorts(),
      masterDataApi.getContainerTypes(),
      masterDataApi.getCarriers(),
      canSeeTeam ? teamApi.getMembers({ status: 'active', limit: 200 }).then((r) => r.members) : Promise.resolve([]),
    ])
      .then(([customersRes, portsRes, typesRes, carriersRes, members]) => {
        setCustomers(customersRes)
        setPorts(portsRes)
        setContainerTypes(typesRes)
        setCarriers(carriersRes)
        setTeamMembers(members)
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (data) => {
    setSubmitting(true)
    try {
      const res = await quotationApi.createQuotation(data)
      toast(`Quotation ${res.data.quotationNo} created`, 'success')
      router.push(`/export/quotations/${res.data._id}`)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="border-b border-line pb-5">
        <Link href="/export/quotations" className="mb-2 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink">
          <FaArrowLeft className="text-xs" /> Back to quotations
        </Link>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-rust">Pre-Booking</p>
        <h1 className="mt-1 font-display text-2xl font-bold uppercase tracking-wide text-ink">New Quotation</h1>
        <p className="mt-1 text-sm text-muted">Client request, carrier & pricing — before it becomes a job</p>
      </div>

      {!canCreate ? (
        <EmptyState title="Not authorized" message="You don't have permission to create quotations." />
      ) : loading ? (
        <PageLoader />
      ) : (
        <QuotationForm
          customers={customers}
          ports={ports}
          containerTypes={containerTypes}
          carriers={carriers}
          teamMembers={teamMembers}
          currentUser={user}
          submitting={submitting}
          onSubmit={handleSubmit}
          onCustomerCreated={(c) => setCustomers((prev) => [...prev, c])}
        />
      )}
    </div>
  )
}
