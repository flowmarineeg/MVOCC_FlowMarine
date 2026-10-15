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

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [customers, setCustomers] = useState([])
  const [ports, setPorts] = useState([])
  const [containerTypes, setContainerTypes] = useState([])
  const [nvoccs, setNvoccs] = useState([])
  const [vesselOperators, setVesselOperators] = useState([])
  const [teamMembers, setTeamMembers] = useState([])

  useEffect(() => {
    Promise.all([
      masterDataApi.getCustomers(),
      masterDataApi.getPorts(),
      masterDataApi.getContainerTypes(),
      masterDataApi.getNvoccs(),
      masterDataApi.getVesselOperators().catch(() => []),
      permissions.includes('team:read')
        ? teamApi.getMembers({ status: 'active', limit: 100 }).then((r) => r.members).catch(() => [])
        : Promise.resolve([]),
    ])
      .then(([customersRes, portsRes, typesRes, nvoccsRes, vosRes, membersRes]) => {
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
  }, [])

  const handleSubmit = async (data, msdsFiles = []) => {
    setSubmitting(true)
    try {
      const res = await quotationApi.createQuotation(data)
      toast(`Quotation ${res.data.quotationNo} created`, 'success')
      if (msdsFiles.length > 0) {
        // The quotation exists now; a failed upload can be retried from its page.
        await quotationApi.uploadMsds(res.data._id, msdsFiles).catch((err) => toast(`MSDS upload failed: ${err.message}`, 'error'))
      }
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
        <p className="text-xs font-medium text-muted">Pre-Booking</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-ink">New Quotation</h1>
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
          nvoccs={nvoccs}
          vesselOperators={vesselOperators}
          currentUser={user}
          teamMembers={teamMembers}
          submitting={submitting}
          onSubmit={handleSubmit}
          onCustomerCreated={(c) => setCustomers((prev) => [...prev, c])}
        />
      )}
    </div>
  )
}
