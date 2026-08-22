'use client'

import { ToastProvider } from '@/components/ui/Toast'

export default function AuthLayout({ children }) {
  return (
    <ToastProvider>
      <div className="min-h-screen flex items-center justify-center bg-paper p-4">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center justify-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center border-2 border-rust font-display text-base font-bold text-rust">
              N
            </div>
            <div className="leading-tight text-center">
              <p className="font-display text-lg font-bold uppercase tracking-wide text-ink">NVOCC</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Ops Console</p>
            </div>
          </div>
          <div className="border border-ink/25 bg-card p-6 shadow-[4px_4px_0_0_var(--color-ink)]">
            {children}
          </div>
        </div>
      </div>
    </ToastProvider>
  )
}
