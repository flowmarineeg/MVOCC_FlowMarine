'use client'

import { motion } from 'framer-motion'
import { FaFileExcel } from 'react-icons/fa'
import Badge from '@/components/ui/Badge'
import Plate from '@/components/ui/Plate'

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '-')

export default function BookingPreviewTable({ bookings = [], onExport, exporting = false }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="border border-ink/25 bg-card"
    >
      <div className="flex items-center justify-between border-b border-ink/25 px-4 py-3">
        <h3 className="font-display text-base font-bold uppercase tracking-wide text-ink">Booking Preview</h3>
        <button
          onClick={onExport}
          disabled={exporting}
          className="flex items-center gap-2 bg-stamp px-4 py-2 text-sm font-semibold text-card transition-colors hover:bg-stamp/90 disabled:opacity-50"
        >
          <FaFileExcel /> {exporting ? 'Exporting…' : 'Export Excel'}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-ink text-left font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              <th className="px-3 py-2.5">Job No</th>
              <th className="px-3 py-2.5">Client</th>
              <th className="px-3 py-2.5">POL</th>
              <th className="px-3 py-2.5">POD</th>
              <th className="px-3 py-2.5">Containers</th>
              <th className="px-3 py-2.5">B/L No</th>
              <th className="px-3 py-2.5">Shipper</th>
              <th className="px-3 py-2.5">Consignee</th>
              <th className="px-3 py-2.5">Vessel</th>
              <th className="px-3 py-2.5">Voyage</th>
              <th className="px-3 py-2.5">ETD</th>
              <th className="px-3 py-2.5">ETA</th>
              <th className="px-3 py-2.5">Job Status</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b._id} className="border-b border-line last:border-0 hover:bg-paper/70 transition-colors">
                <td className="whitespace-nowrap px-3 py-2.5"><Plate>{b.jobNo}</Plate></td>
                <td className="whitespace-nowrap px-3 py-2.5 text-ink">{b.clientName}</td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted">{b.pol}</td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted">{b.pod}</td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted">{b.containersSummary}</td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted">{b.blNo}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted">{b.shipper}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted">{b.consignee}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted">{b.vessel}</td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted">{b.voyageNo}</td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted">{fmtDate(b.etd)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted">{fmtDate(b.eta)}</td>
                <td className="whitespace-nowrap px-3 py-2.5"><Badge value={b.jobStatus} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}
