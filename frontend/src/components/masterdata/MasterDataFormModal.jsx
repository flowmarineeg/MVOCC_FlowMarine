'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FaTimes, FaPlus, FaTrash } from 'react-icons/fa'

// Field types: text (default) | email | date | select | country | governorate | contacts
//  - select:      `options` is a string[] or [{ value, label }]
//  - country:     select fed by the free `country-state-city` library (lazy-loaded)
//  - governorate: states of the country picked in the field named by `countryKey`
//  - contacts:    add/remove rows of { name, title, email, phone }
const inputCls = 'w-full border border-ink/30 bg-paper px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-rust'
const labelCls = 'mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted'
const EMPTY_CONTACT = { name: '', title: '', email: '', phone: '' }

const normalizeOptions = (options = []) => options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))

const initialValue = (field, item) => {
  const raw = item?.[field.key]
  if (field.type === 'contacts') {
    return (raw || []).map((c) => ({ name: c.name || '', title: c.title || '', email: c.email || '', phone: c.phone || '' }))
  }
  if (raw && typeof raw === 'object') return raw._id || ''
  if (field.type === 'date' && raw) return String(raw).slice(0, 10)
  return raw || ''
}

export default function MasterDataFormModal({ isOpen, onClose, onSave, item, fields, title, saving = false }) {
  const [values, setValues] = useState(() =>
    fields.reduce((acc, f) => ({ ...acc, [f.key]: initialValue(f, item) }), {})
  )
  const [error, setError] = useState('')
  const [geo, setGeo] = useState(null)

  const needsGeo = fields.some((f) => f.type === 'country' || f.type === 'governorate')
  useEffect(() => {
    if (!needsGeo) return
    let cancelled = false
    import('country-state-city').then((m) => {
      if (!cancelled) setGeo({ Country: m.Country, State: m.State })
    })
    return () => { cancelled = true }
  }, [needsGeo])

  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }))

  const countryOptions = (current) => {
    const names = geo ? geo.Country.getAllCountries().map((c) => c.name) : []
    // Keep a legacy/free-text value selectable instead of silently blanking it.
    if (current && !names.includes(current)) names.unshift(current)
    return names
  }

  const statesFor = (countryName) => {
    if (!geo || !countryName) return []
    const country = geo.Country.getAllCountries().find((c) => c.name === countryName)
    return country ? geo.State.getStatesOfCountry(country.isoCode).map((s) => s.name) : []
  }

  const setCountry = (field) => (e) => {
    const dependents = fields.filter((f) => f.type === 'governorate' && f.countryKey === field.key).map((f) => f.key)
    setValues((v) => ({ ...v, [field.key]: e.target.value, ...Object.fromEntries(dependents.map((k) => [k, ''])) }))
  }

  const setContact = (key, index, prop) => (e) =>
    setValues((v) => ({ ...v, [key]: v[key].map((c, i) => (i === index ? { ...c, [prop]: e.target.value } : c)) }))
  const addContact = (key) => setValues((v) => ({ ...v, [key]: [...v[key], { ...EMPTY_CONTACT }] }))
  const removeContact = (key, index) => setValues((v) => ({ ...v, [key]: v[key].filter((_, i) => i !== index) }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const payload = { ...values }
    fields.forEach((f) => {
      // A row the user added but never filled in is noise, not a contact.
      if (f.type === 'contacts') payload[f.key] = values[f.key].filter((c) => Object.values(c).some((x) => x.trim()))
    })
    try {
      await onSave(payload)
    } catch (err) {
      setError(err.message)
    }
  }

  const renderField = (f) => {
    const required = f.required !== false
    if (f.type === 'contacts') {
      return (
        <div className="space-y-2">
          {values[f.key].length === 0 && <p className="font-mono text-xs text-muted">No contacts yet.</p>}
          {values[f.key].map((c, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 border border-ink/20 bg-paper/60 p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
              <input placeholder="Name *" value={c.name} onChange={setContact(f.key, i, 'name')} className={inputCls} />
              <input placeholder="Title" value={c.title} onChange={setContact(f.key, i, 'title')} className={inputCls} />
              <input type="email" placeholder="Email" value={c.email} onChange={setContact(f.key, i, 'email')} className={inputCls} />
              <input placeholder="Phone" value={c.phone} onChange={setContact(f.key, i, 'phone')} className={inputCls} />
              <button
                type="button"
                onClick={() => removeContact(f.key, i)}
                title="Remove contact"
                className="flex h-10 w-10 items-center justify-center text-muted transition-colors hover:bg-brick/10 hover:text-brick"
              >
                <FaTrash className="text-xs" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => addContact(f.key)}
            className="flex items-center gap-2 border border-ink/30 px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink transition-colors hover:bg-ink/5"
          >
            <FaPlus className="text-[10px]" /> Add contact
          </button>
        </div>
      )
    }

    if (f.type === 'country') {
      return (
        <select value={values[f.key]} onChange={setCountry(f)} required={required} className={inputCls}>
          <option value="">{geo ? 'Select…' : 'Loading…'}</option>
          {countryOptions(values[f.key]).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      )
    }

    if (f.type === 'governorate') {
      const states = statesFor(values[f.countryKey])
      // Some countries have no subdivisions in the dataset — fall back to free text.
      if (geo && values[f.countryKey] && states.length === 0) {
        return <input value={values[f.key]} onChange={set(f.key)} required={required} className={inputCls} />
      }
      const options = values[f.key] && !states.includes(values[f.key]) ? [values[f.key], ...states] : states
      return (
        <select value={values[f.key]} onChange={set(f.key)} required={required} disabled={!values[f.countryKey]} className={`${inputCls} disabled:opacity-50`}>
          <option value="">{values[f.countryKey] ? 'Select…' : 'Select a country first'}</option>
          {options.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      )
    }

    if (f.type === 'select') {
      return (
        <select value={values[f.key]} onChange={set(f.key)} required={required} className={inputCls}>
          <option value="">Select…</option>
          {normalizeOptions(f.options).map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      )
    }

    return <input type={f.type || 'text'} value={values[f.key]} onChange={set(f.key)} required={required} className={inputCls} />
  }

  const wide = fields.length > 4

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-ink/60" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.15 }}
            className={`relative z-10 max-h-[90vh] w-full overflow-y-auto border border-ink/30 bg-card p-6 shadow-[4px_4px_0_0_var(--color-ink)] ${wide ? 'max-w-3xl' : 'max-w-sm'}`}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold uppercase tracking-wide text-ink">{title}</h3>
              <button onClick={onClose} className="text-muted transition-colors hover:text-ink">
                <FaTimes />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className={`grid grid-cols-1 gap-4 ${wide ? 'sm:grid-cols-2' : ''}`}>
                {fields.map((f) => (
                  <div key={f.key} className={f.type === 'contacts' ? 'sm:col-span-2' : ''}>
                    <label className={labelCls}>
                      {f.label} {f.required !== false && f.type !== 'contacts' && <span className="text-rust">*</span>}
                    </label>
                    {renderField(f)}
                  </div>
                ))}
              </div>
              {error && <p className="font-mono text-xs text-brick">{error}</p>}
              <button
                type="submit"
                disabled={saving}
                className="w-full bg-rust px-4 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-rust-dark disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
