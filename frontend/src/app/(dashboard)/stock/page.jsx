'use client'

import { useEffect, useState } from 'react'
import { FaFileExcel } from 'react-icons/fa'
import * as stockApi from '@/services/stock'
import * as masterDataApi from '@/services/masterData'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { PageLoader } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import Select from '@/components/ui/Select'
import StockOverviewTable from '@/components/stock/StockOverviewTable'
import ContainerDetailModal from '@/components/stock/ContainerDetailModal'
import ImportContainersModal from '@/components/stock/ImportContainersModal'

export default function StockPage() {
  const { permissions } = useAuth()
  const toast = useToast()
  const canCreate = permissions.includes('masterData:create')
  const canUpdate = permissions.includes('masterData:update')

  const [containerTypes, setContainerTypes] = useState([])
  const [nvoccs, setNvoccs] = useState([])
  const [filterType, setFilterType] = useState('')
  const [filterNvocc, setFilterNvocc] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewGroup, setViewGroup] = useState(null)
  const [importOpen, setImportOpen] = useState(false)

  useEffect(() => {
    Promise.all([masterDataApi.getContainerTypes(), masterDataApi.getNvoccs()])
      .then(([types, nv]) => {
        setContainerTypes(types)
        setNvoccs(nv)
      })
      .catch((err) => toast(err.message, 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadOverview = () => {
    stockApi
      .getStockOverview({ containerType: filterType || undefined, nvocc: filterNvocc || undefined })
      .then(setRows)
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadOverview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterNvocc])

  const typeOptions = [
    { value: '', label: 'All container types' },
    ...containerTypes.map((t) => ({ value: t._id, label: `${t.code} — ${t.label}` })),
  ]
  const nvoccOptions = [{ value: '', label: 'All NVOCCs' }, ...nvoccs.map((n) => ({ value: n._id, label: n.name }))]

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-4 border-b border-line pb-5 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-rust">Reference Data</p>
          <h1 className="mt-1 font-display text-3xl font-bold uppercase tracking-wide text-ink">Stock</h1>
          <p className="mt-1 text-sm text-muted">Container inventory by type and NVOCC</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 self-start bg-rust px-4 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-rust-dark"
          >
            <FaFileExcel /> Import Excel
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:max-w-xl sm:grid-cols-2">
        <Select label="NVOCC" options={nvoccOptions} value={filterNvocc} onChange={setFilterNvocc} placeholder="All NVOCCs" />
        <Select label="Container Type" options={typeOptions} value={filterType} onChange={setFilterType} placeholder="All container types" />
      </div>

      {loading ? (
        <PageLoader />
      ) : rows.length === 0 ? (
        <EmptyState title="No stock recorded" message="Import an Excel sheet to register container units." />
      ) : (
        <StockOverviewTable rows={rows} onView={setViewGroup} />
      )}

      <ContainerDetailModal group={viewGroup} onClose={() => setViewGroup(null)} canUpdate={canUpdate} onChanged={loadOverview} />

      <ImportContainersModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          setImportOpen(false)
          loadOverview()
        }}
      />
    </div>
  )
}
