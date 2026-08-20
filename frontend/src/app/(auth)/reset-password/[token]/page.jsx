'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import * as authApi from '@/services/auth'
import PasswordInput from '@/components/ui/PasswordInput'

const inputCls = 'w-full border border-ink/20 bg-paper px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust'
const labelCls = 'mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted'

export default function ResetPasswordPage() {
  const { token } = useParams()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setSubmitting(true)
    try {
      await authApi.resetPassword(token, { password })
      router.push('/login')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <h1 className="mb-1 font-display text-xl font-bold uppercase tracking-wide text-ink">Set a new password</h1>
      <p className="mb-6 text-sm text-muted">Choose a new password for your account.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls}>New password</label>
          <PasswordInput minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required className={inputCls} autoFocus />
        </div>
        <div>
          <label className={labelCls}>Confirm password</label>
          <PasswordInput minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required className={inputCls} />
        </div>
        {error && <p className="font-mono text-xs text-brick">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-rust px-4 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-rust-dark disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Set password'}
        </button>
      </form>

      <div className="mt-5 text-center">
        <Link href="/login" className="font-mono text-xs text-muted underline-offset-2 hover:text-ink hover:underline">
          Back to sign in
        </Link>
      </div>
    </>
  )
}
