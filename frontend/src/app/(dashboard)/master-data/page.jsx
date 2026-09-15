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
import Modal from '@/components/ui/Modal'
import { COUNTRY_NAMES } from '@/constants/countries'

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
    delete: masterDataApi.deleteContainerType,
  },
  carriers: {
    tabLabel: 'Carriers',
    singular: 'Carrier',
    fields: [
      { key: 'name', label: 'Carrier Name' },
      { key: 'code', label: 'Carrier Code' },
    ],
    get: () => masterDataApi.getCarriers(false),
    create: masterDataApi.createCarrier,
    update: masterDataApi.updateCarrier,
    toggle: masterDataApi.toggleCarrier,
    delete: masterDataApi.deleteCarrier,
  },
  ports: {
    tabLabel: 'Ports (POL / POD)',
    singular: 'Port',
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'code', label: 'Code (UN/LOCODE)' },
      { key: 'country', label: 'Country', type: 'select', options: COUNTRY_NAMES },
    ],
    get: () => masterDataApi.getPorts(false),
    create: masterDataApi.createPort,
    update: masterDataApi.updatePort,
    toggle: masterDataApi.togglePort,
    delete: masterDataApi.deletePort,
  },
  nvoccs: {
    tabLabel: 'NVOCC',
    singular: 'NVOCC',
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'code', label: 'Code' },
      { key: 'contractType', label: 'Contract Type', type: 'select', options: ['Contract', 'Spot'], required: false },
      { key: 'contractValidFrom', label: 'Contract Valid From', type: 'date', required: false },
      { key: 'contractValidTo', label: 'Contract Valid To', type: 'date', required: false },
      { key: 'localAgentName', label: 'Local Agent Name', required: false },
      { key: 'localAgentContact', label: 'Local Agent Contact', required: false },
      { key: 'tradeLane', label: 'Trade Lane Covered', required: false },
    ],
    get: () => masterDataApi.getNvoccs(false),
    create: masterDataApi.createNvocc,
    update: masterDataApi.updateNvocc,
    toggle: masterDataApi.toggleNvocc,
    delete: masterDataApi.deleteNvocc,
  },
  depots: {
    tabLabel: 'Depots',
    singular: 'Depot',
    fields: [
      { key: 'name', label: 'Depot Name' },
      { key: 'code', label: 'Depot Code' },
    ],
    get: () => masterDataApi.getDepots(false),
    create: masterDataApi.createDepot,
    update: masterDataApi.updateDepot,
    toggle: masterDataApi.toggleDepot,
    delete: masterDataApi.deleteDepot,
  },
  customers: {
    tabLabel: 'Customers',
    singular: 'Customer',
    fields: masterDataApi.CUSTOMER_FORM_FIELDS,
    get: () => masterDataApi.getCustomers(false),
    create: masterDataApi.createCustomer,
    update: masterDataApi.updateCustomer,
    toggle: masterDataApi.toggleCustomer,
    delete: masterDataApi.deleteCustomer,
  },
}

const TABS = Object.keys(ENTITIES).map((key) => ({ key, label: ENTITIES[key].tabLabel }))

export default function MasterDataPage() {
  const { permissions } = useAuth()
  const toast = useToast()
  const canCreate = permissions.includes('masterData:create')
  const canUpdate = permissions.includes('masterData:update')

  const [tab, setTab] = useState('containerTypes')
  const [data, setData] = useState({ containerTypes: [], carriers: [], ports: [], nvoccs: [], depots: [], customers: [] })
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const loadAll = () => {
    Promise.all([
      ENTITIES.containerTypes.get(),
      ENTITIES.carriers.get(),
      ENTITIES.ports.get(),
      ENTITIES.nvoccs.get(),
      ENTITIES.depots.get(),
      ENTITIES.customers.get(),
    ])
      .then(([containerTypes, carriers, ports, nvoccs, depots, customers]) => {
        setData({ containerTypes, carriers, ports, nvoccs, depots, customers })
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
  }

  // A mutation only ever affects the active tab's own list — no need to
  // re-fetch all four entity types just to refresh one table.
  const reloadTab = (key) => {
    ENTITIES[key].get()
      .then((items) => setData((d) => ({ ...d, [key]: items })))
      .catch((err) => toast(err.message, 'error'))
  }

  useEffect(() => {
    loadAll()
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
      reloadTab(tab)
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (item) => {
    setBusyId(item._id)
    try {
      await ENTITIES[tab].toggle(item._id)
      toast(item.isActive ? 'Deactivated' : 'Activated', 'success')
      reloadTab(tab)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await ENTITIES[tab].delete(deleteTarget._id)
      toast(`${ENTITIES[tab].singular} deleted`, 'success')
      setDeleteTarget(null)
      reloadTab(tab)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  const activeEntity = ENTITIES[tab]
  const activeItems = activeEntity ? data[tab] : []

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-4 border-b border-line pb-5 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-rust">Reference Data</p>
          <h1 className="mt-1 font-display text-3xl font-bold uppercase tracking-wide text-ink">Master Data</h1>
          <p className="mt-1 text-sm text-muted">Ports, carriers, NVOCCs, depots, and container types</p>
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
          onDeleteRequest={setDeleteTarget}
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

      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete this ${activeEntity?.singular.toLowerCase()}?`}
        message={`This will permanently delete "${deleteTarget?.name || deleteTarget?.code || deleteTarget?.label || ''}". This cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={deleting}
      />
    </div>
  )
}
