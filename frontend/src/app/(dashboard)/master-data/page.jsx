'use client'

import { useEffect, useState } from 'react'
import { FaPlus } from 'react-icons/fa'
import * as masterDataApi from '@/services/masterData'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { PageLoader } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import MasterDataTable from '@/components/masterdata/MasterDataTable'
import MasterDataFormModal from '@/components/masterdata/MasterDataFormModal'
import StockTable from '@/components/masterdata/StockTable'

const ENTITIES = {
  containerTypes: {
    tabLabel: 'Container Types',
    singular: 'Container Type',
    fields: [
      { key: 'code', label: 'Code' },
      { key: 'label', label: 'Label' },
    ],
    get: () => masterDataApi.getContainerTypes(false),
    create: masterDataApi.createContainerType,
    update: masterDataApi.updateContainerType,
    toggle: masterDataApi.toggleContainerType,
  },
  vessels: {
    tabLabel: 'Vessels',
    singular: 'Vessel',
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'code', label: 'Code' },
    ],
    get: () => masterDataApi.getVessels(false),
    create: masterDataApi.createVessel,
    update: masterDataApi.updateVessel,
    toggle: masterDataApi.toggleVessel,
  },
  ports: {
    tabLabel: 'Ports (POL / POD)',
    singular: 'Port',
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'code', label: 'Code (UN/LOCODE)' },
      { key: 'country', label: 'Country' },
    ],
    get: () => masterDataApi.getPorts(false),
    create: masterDataApi.createPort,
    update: masterDataApi.updatePort,
    toggle: masterDataApi.togglePort,
  },
}

const TABS = [...Object.keys(ENTITIES).map((key) => ({ key, label: ENTITIES[key].tabLabel })), { key: 'stock', label: 'Stock' }]

export default function MasterDataPage() {
  const { permissions } = useAuth()
  const toast = useToast()
  const canCreate = permissions.includes('masterData:create')
  const canUpdate = permissions.includes('masterData:update')

  const [tab, setTab] = useState('containerTypes')
  const [data, setData] = useState({ containerTypes: [], vessels: [], ports: [] })
  const [stockRows, setStockRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = () => {
    Promise.all([
      ENTITIES.containerTypes.get(),
      ENTITIES.vessels.get(),
      ENTITIES.ports.get(),
      masterDataApi.getContainerStock(),
    ])
      .then(([containerTypes, vessels, ports, stock]) => {
        setData({ containerTypes, vessels, ports })
        const stockMap = {}
        stock.forEach((s) => { stockMap[s.containerType._id] = s.availableCount })
        setStockRows(containerTypes.map((ct) => ({ containerType: ct, availableCount: stockMap[ct._id] ?? 0 })))
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openCreate = () => {
    setEditingItem(null)
    setModalOpen(true)
  }

  const openEdit = (item) => {
    setEditingItem(item)
    setModalOpen(true)
  }

  const handleSave = async (values) => {
    setSaving(true)
    try {
      const entity = ENTITIES[tab]
      if (editingItem) {
        await entity.update(editingItem._id, values)
        toast(`${entity.singular} updated`, 'success')
      } else {
        await entity.create(values)
        toast(`${entity.singular} created`, 'success')
      }
      setModalOpen(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (item) => {
    setBusyId(item._id)
    try {
      await ENTITIES[tab].toggle(item._id)
      toast(item.isActive ? 'Deactivated' : 'Activated', 'success')
      load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleStockSave = async (typeId, count) => {
    setBusyId(typeId)
    try {
      await masterDataApi.updateContainerStock(typeId, count)
      toast('Stock updated', 'success')
      load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  const activeEntity = tab === 'stock' ? null : ENTITIES[tab]
  const activeItems = activeEntity ? data[tab] : []

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-4 border-b border-line pb-5 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-rust">Reference Data</p>
          <h1 className="mt-1 font-display text-3xl font-bold uppercase tracking-wide text-ink">Master Data</h1>
          <p className="mt-1 text-sm text-muted">Ports, vessels, container types, and stock levels</p>
        </div>
        {canCreate && activeEntity && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 self-start bg-rust px-4 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-rust-dark"
          >
            <FaPlus /> New {activeEntity.singular}
          </button>
        )}
      </div>

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

      {loading ? (
        <PageLoader />
      ) : tab === 'stock' ? (
        stockRows.length === 0 ? (
          <EmptyState title="No container types yet" message="Add a container type first, then set its stock." />
        ) : (
          <StockTable rows={stockRows} canUpdate={canUpdate} savingId={busyId} onSave={handleStockSave} />
        )
      ) : activeItems.length === 0 ? (
        <EmptyState
          title={`No ${activeEntity.tabLabel.toLowerCase()} yet`}
          message={canCreate ? `Add the first ${activeEntity.singular.toLowerCase()} to get started.` : 'Nothing on file yet.'}
        />
      ) : (
        <MasterDataTable
          items={activeItems}
          fields={activeEntity.fields}
          canUpdate={canUpdate}
          onEdit={openEdit}
          onToggle={handleToggle}
          busyId={busyId}
        />
      )}

      {activeEntity && (
        <MasterDataFormModal
          key={`${tab}-${editingItem?._id || 'new'}`}
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
          item={editingItem}
          fields={activeEntity.fields}
          title={editingItem ? `Edit ${activeEntity.singular}` : `New ${activeEntity.singular}`}
          saving={saving}
        />
      )}
    </div>
  )
}
