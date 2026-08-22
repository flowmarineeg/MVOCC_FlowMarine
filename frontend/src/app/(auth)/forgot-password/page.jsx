'use client'

import { useState } from 'react'
import Link from 'next/link'
import * as authApi from '@/services/auth'

const inputCls = 'w-full border border-ink/30 bg-paper px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust'
const labelCls = 'mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await authApi.forgotPassword({ email })
    } finally {
      setSubmitting(false)
      setSent(true)
    }
  }

  if (sent) {
    return (
      <div className="text-center">
        <h1 className="mb-2 font-display text-xl font-bold uppercase tracking-wide text-ink">Check your email</h1>
        <p className="text-sm text-muted">
          If that email exists in our system, a reset link has been sent. It expires in an hour.
        </p>
        <Link href="/login" className="mt-5 inline-block font-mono text-xs text-rust hover:text-rust-dark">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <>
      <h1 className="mb-1 font-display text-xl font-bold uppercase tracking-wide text-ink">Forgot password</h1>
      <p className="mb-6 text-sm text-muted">Enter your email and we&apos;ll send you a reset link.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputCls} autoFocus />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-rust px-4 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-rust-dark disabled:opacity-50"
        >
          {submitting ? 'Sending…' : 'Send reset link'}
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
