'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { FaArrowLeft } from 'react-icons/fa'
import * as blApi from '@/services/bl'
import { PageLoader } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import Badge from '@/components/ui/Badge'
import Plate from '@/components/ui/Plate'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'
import BLForm from '@/components/export/BLForm'

export default function BLDetailPage() {
  const { id } = useParams()
  const toast = useToast()
  const { permissions } = useAuth()
  const canRead = permissions.includes('bl:read')
  const canUpdate = permissions.includes('bl:update')

  const [job, setJob] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = () => {
    blApi.getBlById(id).then(setJob).catch((err) => toast(err.message, 'error')).finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleSave = async (data) => {
    setSaving(true)
    try {
      const updated = await blApi.updateBl(id, data)
      setJob(updated)
      toast('B&L data saved', 'success')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!canRead) return <div className="p-4 sm:p-6"><EmptyState title="Not authorized" message="You don't have permission to view B&L documentation." /></div>
  if (loading) return <div className="p-6"><PageLoader /></div>
  if (!job) return null

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="border-b border-line pb-5">
        <Link href="/export/bl" className="mb-2 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink">
          <FaArrowLeft className="text-xs" /> Back to B&amp;L
        </Link>
        <div className="flex items-center gap-3">
          <Plate className="text-sm">{job.jobNo}</Plate>
          <Badge value={job.jobStatus} />
        </div>
        <p className="mt-1.5 text-sm text-muted">{job.clientName}</p>
      </div>

      <BLForm key={job.updatedAt} booking={job} canUpdate={canUpdate} submitting={saving} onSubmit={handleSave} />
    </div>
  )
}
