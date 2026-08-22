'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FaTimes, FaFileExcel, FaDownload, FaCheckCircle } from 'react-icons/fa'
import * as stockApi from '@/services/stock'
import { useToast } from '@/components/ui/Toast'
import Spinner from '@/components/ui/Spinner'

const EXPECTED_COLUMNS = ['Container Type Code', 'NVOCC Code', 'Container Number']

const ROW_STYLES = {
  valid: 'bg-stamp/10 border-l-4 border-stamp',
  invalid: 'bg-signal/10 border-l-4 border-signal',
  duplicate: 'bg-brick/10 border-l-4 border-brick',
}

const STATUS_LABEL = {
  valid: 'Valid',
  invalid: 'Invalid',
  duplicate: 'Duplicate',
}

export default function ImportContainersModal({ isOpen, onClose, onImported }) {
  const toast = useToast()
  const [file, setFile] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState(null) // { headers, rows }
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)

  const reset = () => {
    setFile(null)
    setPreview(null)
    setResult(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleFileChange = async (e) => {
    const picked = e.target.files?.[0] || null
    setFile(picked)
    setPreview(null)
    setResult(null)
    if (!picked) return

    setPreviewing(true)
    try {
      const data = await stockApi.previewImportContainers(picked)
      setPreview(data)
    } catch (err) {
      toast(err.message, 'error')
      setFile(null)
    } finally {
      setPreviewing(false)
    }
  }

  const handleImport = async () => {
    const validRows = preview.rows.filter((r) => r.status === 'valid')
    if (validRows.length === 0) return
    setImporting(true)
    try {
      const payload = validRows.map(({ rowNumber, containerTypeCode, nvoccCode, containerNumber }) => ({
        rowNumber, containerTypeCode, nvoccCode, containerNumber,
      }))
      const data = await stockApi.commitImportContainers(payload)
      setResult(data)
      toast(`${data.createdCount} container(s) imported`, 'success')
      onImported?.()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setImporting(false)
    }
  }

  const handleDownloadTemplate = async () => {
    try {
      await stockApi.downloadImportTemplate()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const validCount = preview?.rows.filter((r) => r.status === 'valid').length || 0
  const invalidCount = preview?.rows.filter((r) => r.status === 'invalid').length || 0
  const duplicateCount = preview?.rows.filter((r) => r.status === 'duplicate').length || 0

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-ink/60"
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.15 }}
            className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col border border-ink/20 bg-card p-6 shadow-[4px_4px_0_0_var(--color-ink)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-lg font-bold uppercase tracking-wide text-ink">Import Container Stock</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  Upload an Excel sheet, review the preview below, then confirm. Row 1 is treated as a header and skipped.
                </p>
              </div>
              <button onClick={handleClose} className="text-muted transition-colors hover:text-ink">
                <FaTimes />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 border border-dashed border-ink/25 bg-paper px-4 py-2.5 text-sm text-muted transition-colors hover:border-rust hover:text-ink">
                <FaFileExcel />
                {file ? file.name : 'Choose .xlsx / .xls file'}
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
              </label>
              <button
                onClick={handleDownloadTemplate}
                className="flex items-center gap-2 border border-ink/20 px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-ink/5"
              >
                <FaDownload className="text-xs" /> Download Template
              </button>
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
              {previewing ? (
                <div className="flex items-center justify-center gap-3 py-10">
                  <Spinner size="sm" />
                  <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Reading file…</p>
                </div>
              ) : preview ? (
                <>
                  <div className="mb-3 border border-ink/15 bg-paper p-3 text-xs">
                    <p className="font-mono font-semibold uppercase tracking-[0.08em] text-muted">Detected columns in your file</p>
                    <ul className="mt-1.5 space-y-0.5 text-ink">
                      {EXPECTED_COLUMNS.map((expected, i) => (
                        <li key={expected}>
                          Column {String.fromCharCode(65 + i)} (
                          <span className="font-mono text-muted">{preview.headers[i] || 'blank'}</span>
                          ) → <span className="font-semibold">{expected}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mb-3 flex flex-wrap gap-3 font-mono text-xs uppercase tracking-[0.08em]">
                    <span className="text-stamp">{validCount} valid</span>
                    <span className="text-signal">{invalidCount} invalid</span>
                    <span className="text-brick">{duplicateCount} duplicate</span>
                  </div>

                  <div className="overflow-x-auto border border-ink/15">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-ink text-left font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                          <th className="px-3 py-2">Row</th>
                          <th className="px-3 py-2">Type Code</th>
                          <th className="px-3 py-2">NVOCC Code</th>
                          <th className="px-3 py-2">Container No.</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Message</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((row) => (
                          <tr key={row.rowNumber} className={ROW_STYLES[row.status]}>
                            <td className="px-3 py-2 font-mono text-ink">{row.rowNumber}</td>
                            <td className="px-3 py-2 text-ink">{row.containerTypeCode || '—'}</td>
                            <td className="px-3 py-2 text-ink">{row.nvoccCode || '—'}</td>
                            <td className="px-3 py-2 font-mono text-ink">{row.containerNumber || '—'}</td>
                            <td className="px-3 py-2 font-semibold text-ink">{STATUS_LABEL[row.status]}</td>
                            <td className="px-3 py-2 text-muted">{row.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="py-8 text-center text-sm text-muted">Choose a file to see a preview before importing.</p>
              )}

              {result && (
                <div className="mt-3 flex items-center gap-2 border border-stamp/40 bg-stamp/10 p-3 text-sm text-ink">
                  <FaCheckCircle className="text-stamp" />
                  {result.createdCount} container(s) imported
                  {result.skippedCount > 0 && `, ${result.skippedCount} row(s) skipped`}.
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-line pt-4">
              <button
                onClick={handleClose}
                disabled={importing}
                className="border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-ink/5 disabled:opacity-50"
              >
                Close
              </button>
              {preview && !result && (
                <button
                  onClick={handleImport}
                  disabled={validCount === 0 || importing}
                  className="bg-rust px-4 py-2 text-sm font-semibold text-card transition-colors hover:bg-rust-dark disabled:opacity-50"
                >
                  {importing ? 'Importing…' : `Import ${validCount} valid row(s)`}
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
