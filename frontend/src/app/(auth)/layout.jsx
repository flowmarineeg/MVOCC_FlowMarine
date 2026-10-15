'use client'

import { ToastProvider } from '@/components/ui/Toast'

export default function AuthLayout({ children }) {
  return (
    <ToastProvider>
      <div className="flex min-h-screen items-center justify-center bg-paper p-4">
        <div className="w-full max-w-md">
          <div className="mb-6 flex flex-col items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rust text-base font-semibold text-white">N</div>
            <div className="text-center leading-tight">
              <p className="text-base font-semibold text-ink">NVOCC Ops Console</p>
              <p className="text-sm text-muted">Export bookings, quotations and stock</p>
            </div>
          </div>
          <div className="rounded-xl border border-line bg-card p-6 shadow-sm">{children}</div>
        </div>
      </div>
    </ToastProvider>
  )
}
