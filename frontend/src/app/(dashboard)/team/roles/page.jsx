'use client'

import { useEffect, useState } from 'react'
import { FaPlus, FaLock, FaEdit, FaTrash } from 'react-icons/fa'
import * as rbacApi from '@/services/rbac'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { PageLoader } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import Modal from '@/components/ui/Modal'
import RolePermissionEditor from '@/components/team/RolePermissionEditor'

export default function RolesPage() {
  const { permissions } = useAuth()
  const toast = useToast()
  const canCreate = permissions.includes('role:create')
  const canUpdate = permissions.includes('role:update')
  const canDelete = permissions.includes('role:delete')

  const [roles, setRoles] = useState([])
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingRole, setEditingRole] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = () => {
    Promise.all([rbacApi.getRoles(), rbacApi.getPermissions()])
      .then(([rolesRes, permsRes]) => {
        setRoles(rolesRes)
        setCatalog(permsRes)
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openCreate = () => {
    setEditingRole(null)
    setEditorOpen(true)
  }

  const openEdit = (role) => {
    setEditingRole(role)
    setEditorOpen(true)
  }

  const handleSave = async (data) => {
    setSaving(true)
    try {
      if (editingRole) {
        await rbacApi.updateRole(editingRole._id, data)
        toast('Role updated', 'success')
      } else {
        await rbacApi.createRole(data)
        toast('Role created', 'success')
      }
      setEditorOpen(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await rbacApi.deleteRole(deleteTarget._id)
      toast('Role deleted', 'success')
      setDeleteTarget(null)
      load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-4 border-b border-line pb-5 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-rust">Platform</p>
          <h1 className="mt-1 font-display text-3xl font-bold uppercase tracking-wide text-ink">Roles</h1>
          <p className="mt-1 text-sm text-muted">Permission matrix for each role</p>
        </div>
        {canCreate && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 self-start bg-rust px-4 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-rust-dark"
          >
            <FaPlus /> New role
          </button>
        )}
      </div>

      {loading ? (
        <PageLoader />
      ) : roles.length === 0 ? (
        <EmptyState title="No roles found" message="Something's off — roles should be seeded by default." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {roles.map((role) => (
            <div key={role._id} className="border border-ink/25 bg-card p-5">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-base font-bold uppercase tracking-wide text-ink">{role.name}</h3>
                  {role.isSystem && <FaLock className="text-xs text-muted" title="System role" />}
                </div>
                <div className="flex items-center gap-1">
                  {canUpdate && (
                    <button
                      onClick={() => openEdit(role)}
                      className="flex h-8 w-8 items-center justify-center text-muted transition-colors hover:bg-ink/5 hover:text-ink"
                      title="Edit"
                    >
                      <FaEdit className="text-xs" />
                    </button>
                  )}
                  {canDelete && !role.isSystem && (
                    <button
                      onClick={() => setDeleteTarget(role)}
                      className="flex h-8 w-8 items-center justify-center text-muted transition-colors hover:bg-brick/10 hover:text-brick"
                      title="Delete"
                    >
                      <FaTrash className="text-xs" />
                    </button>
                  )}
                </div>
              </div>
              {role.description && <p className="mb-3 text-sm text-muted">{role.description}</p>}
              <p className="font-mono text-xs uppercase tracking-wide text-muted">
                {role.permissions.length} permission{role.permissions.length === 1 ? '' : 's'}
              </p>
            </div>
          ))}
        </div>
      )}

      <RolePermissionEditor
        key={editingRole?._id || 'new'}
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={handleSave}
        role={editingRole}
        permissionsCatalog={catalog}
        saving={saving}
      />

      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete this role?"
        message={`This will permanently delete "${deleteTarget?.name}". Roles assigned to a member cannot be deleted.`}
        confirmLabel="Delete role"
        danger
        loading={deleting}
      />
    </div>
  )
}
