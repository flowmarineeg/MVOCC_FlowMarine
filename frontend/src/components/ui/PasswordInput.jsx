'use client'

import { useState } from 'react'
import { FaEye, FaEyeSlash } from 'react-icons/fa'

export default function PasswordInput({ value, onChange, className = '', ...props }) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        className={`${className} pr-10`}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-ink"
      >
        {visible ? <FaEyeSlash className="text-sm" /> : <FaEye className="text-sm" />}
      </button>
    </div>
  )
}
