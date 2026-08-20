'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import PasswordInput from '@/components/ui/PasswordInput'

const inputCls = 'w-full border border-ink/20 bg-paper px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust'
const labelCls = 'mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted'

export default function LoginPage() {
  const { login } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('admin@nvocc.local')
  const [password, setPassword] = useState('ChangeMe123!')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login({ email, password })
      router.push('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <h1 className="mb-1 font-display text-xl font-bold uppercase tracking-wide text-ink">Sign in</h1>
      <p className="mb-6 text-sm text-muted">Log in with your NVOCC account.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputCls} autoFocus />
        </div>
        <div>
          <label className={labelCls}>Password</label>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required className={inputCls} />
        </div>
        {error && <p className="font-mono text-xs text-brick">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-rust px-4 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-rust-dark disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="mt-5 text-center">
        <Link href="/forgot-password" className="font-mono text-xs text-muted underline-offset-2 hover:text-ink hover:underline">
          Forgot your password?
        </Link>
      </div>
    </>
  )
}
