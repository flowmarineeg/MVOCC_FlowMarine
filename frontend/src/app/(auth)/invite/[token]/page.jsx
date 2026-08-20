'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import * as teamApi from '@/services/team'
import Spinner from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import PasswordInput from '@/components/ui/PasswordInput'

const inputCls = 'w-full border border-ink/20 bg-paper px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust'
const labelCls = 'mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted'

export default function InviteAcceptPage() {
  const { token } = useParams()
  const router = useRouter()
  const toast = useToast()
  const [invite, setInvite] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [formError, setFormError] = useState('')
  const [accepting, setAccepting] = useState(false)
  const [refusing, setRefusing] = useState(false)

  useEffect(() => {
    teamApi
      .getInvitationByToken(token)
      .then(setInvite)
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  const handleAccept = async (e) => {
    e.preventDefault()
    setFormError('')
    if (password !== confirm) {
      setFormError('Passwords do not match')
      return
    }
    setAccepting(true)
    try {
      await teamApi.acceptInvitation(token, { name, password })
      toast('Invitation accepted — you can now sign in', 'success')
      router.push('/login')
    } catch (err) {
      setFormError(err.message)
    } finally {
      setAccepting(false)
    }
  }

  const handleRefuse = async () => {
    setRefusing(true)
    try {
      await teamApi.refuseInvitation(token)
      toast('Invitation declined', 'success')
      router.push('/login')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setRefusing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner size="lg" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="text-center">
        <h1 className="mb-2 font-display text-xl font-bold uppercase tracking-wide text-ink">Invitation unavailable</h1>
        <p className="text-sm text-muted">{loadError}</p>
        <Link href="/login" className="mt-5 inline-block font-mono text-xs text-rust hover:text-rust-dark">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <>
      <h1 className="mb-1 font-display text-xl font-bold uppercase tracking-wide text-ink">You&apos;re invited</h1>
      <p className="mb-6 text-sm text-muted">
        {invite.invitedByName || 'An admin'} invited <strong className="text-ink">{invite.email}</strong> to join as{' '}
        <strong className="text-ink">{invite.roleName}</strong>.
      </p>

      <form onSubmit={handleAccept} className="space-y-4">
        <div>
          <label className={labelCls}>Your name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} autoFocus />
        </div>
        <div>
          <label className={labelCls}>Password</label>
          <PasswordInput minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Confirm password</label>
          <PasswordInput minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required className={inputCls} />
        </div>
        {formError && <p className="font-mono text-xs text-brick">{formError}</p>}
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <button
            type="submit"
            disabled={accepting || refusing}
            className="flex-1 bg-rust px-4 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-rust-dark disabled:opacity-50"
          >
            {accepting ? 'Setting up…' : 'Accept & set password'}
          </button>
          <button
            type="button"
            onClick={handleRefuse}
            disabled={accepting || refusing}
            className="border border-brick/40 px-4 py-2.5 text-sm font-medium text-brick transition-colors hover:bg-brick/5 disabled:opacity-50"
          >
            {refusing ? 'Declining…' : 'Decline'}
          </button>
        </div>
      </form>
    </>
  )
}
