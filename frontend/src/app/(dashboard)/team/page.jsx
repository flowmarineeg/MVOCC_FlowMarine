'use client'

import { useEffect, useState } from 'react'
import { FaPlus } from 'react-icons/fa'
import * as teamApi from '@/services/team'
import * as rbacApi from '@/services/rbac'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { PageLoader } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import MemberTable from '@/components/team/MemberTable'
import InvitationTable from '@/components/team/InvitationTable'
import InviteModal from '@/components/team/InviteModal'

const TABS = [
  { key: 'members', label: 'Members' },
  { key: 'invitations', label: 'Invitations' },
]

export default function TeamPage() {
  const { user, permissions } = useAuth()
  const toast = useToast()
  const canInvite = permissions.includes('team:invite')
  const canManage = permissions.includes('team:update')

  const [tab, setTab] = useState('members')
  const [members, setMembers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviting, setInviting] = useState(false)

  const load = () => {
    Promise.all([
      teamApi.getMembers({ limit: 100 }),
      teamApi.getInvitations({ limit: 100 }),
      canInvite || canManage ? rbacApi.getRoles() : Promise.resolve([]),
    ])
      .then(([membersRes, invitationsRes, rolesRes]) => {
        setMembers(membersRes.members)
        setInvitations(invitationsRes.invitations)
        setRoles(rolesRes)
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleInvite = async (data) => {
    setInviting(true)
    try {
      await teamApi.inviteMember(data)
      toast('Invitation sent', 'success')
      setInviteOpen(false)
      load()
    } finally {
      setInviting(false)
    }
  }

  const handleChangeRole = async (id, roleId) => {
    setBusyId(id)
    try {
      await teamApi.updateMemberRole(id, { roleId })
      toast('Role updated', 'success')
      load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleDeactivate = async (id) => {
    setBusyId(id)
    try {
      await teamApi.deactivateMember(id)
      toast('Member deactivated', 'success')
      load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleReactivate = async (id) => {
    setBusyId(id)
    try {
      await teamApi.reactivateMember(id)
      toast('Member reactivated', 'success')
      load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleResend = async (id) => {
    setBusyId(id)
    try {
      await teamApi.resendInvitation(id)
      toast('Invitation resent', 'success')
      load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleRevoke = async (id) => {
    setBusyId(id)
    try {
      await teamApi.revokeInvitation(id)
      toast('Invitation revoked', 'success')
      load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-4 border-b border-line pb-5 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-rust">Platform</p>
          <h1 className="mt-1 font-display text-3xl font-bold uppercase tracking-wide text-ink">Team</h1>
          <p className="mt-1 text-sm text-muted">Members and pending invitations</p>
        </div>
        {canInvite && (
          <button
            onClick={() => setInviteOpen(true)}
            className="flex items-center gap-2 self-start bg-rust px-4 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-rust-dark"
          >
            <FaPlus /> Invite teammate
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-line">
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
      ) : tab === 'members' ? (
        members.length === 0 ? (
          <EmptyState title="No members yet" message="Invite your first teammate to get started." />
        ) : (
          <MemberTable
            members={members}
            roles={roles}
            currentUserId={user?._id}
            canManage={canManage}
            onChangeRole={handleChangeRole}
            onDeactivate={handleDeactivate}
            onReactivate={handleReactivate}
            busyId={busyId}
          />
        )
      ) : invitations.length === 0 ? (
        <EmptyState title="No invitations" message="Invitations you send will show up here." />
      ) : (
        <InvitationTable invitations={invitations} canInvite={canInvite} onResend={handleResend} onRevoke={handleRevoke} busyId={busyId} />
      )}

      <InviteModal isOpen={inviteOpen} onClose={() => setInviteOpen(false)} onInvite={handleInvite} roles={roles} submitting={inviting} />
    </div>
  )
}
