'use client'

import { createContext, useContext, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FaCheckCircle, FaTimesCircle, FaTimes } from 'react-icons/fa'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((message, type = 'success') => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  const remove = (id) => setToasts((prev) => prev.filter((t) => t.id !== id))

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex w-full max-w-sm flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 16, x: 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className={`flex items-start gap-3 border-l-4 bg-card p-4 shadow-[3px_3px_0_0_var(--color-ink)] ${
                t.type === 'success' ? 'border-stamp' : 'border-brick'
              }`}
            >
              {t.type === 'success'
                ? <FaCheckCircle className="mt-0.5 shrink-0 text-stamp" />
                : <FaTimesCircle className="mt-0.5 shrink-0 text-brick" />}
              <p className="flex-1 text-sm font-medium text-ink">{t.message}</p>
              <button onClick={() => remove(t.id)} className="text-muted transition-colors hover:text-ink">
                <FaTimes size={12} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
