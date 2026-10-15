'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import * as quotationApi from '@/services/quotation'

// Permanent delete of a quotation, always behind a confirm dialog. A quotation that
// already became a job can't be deleted: the dialog says so and offers to open the
// job instead — delete the job (booking) first, then come back for the quotation.
export default function DeleteQuotationModal({ quotation, onClose, onDeleted }) {
  const router = useRouter()
  const toast = useToast()
  const [deleting, setDeleting] = useState(false)

  if (!quotation) return null
  const job = quotation.linkedBooking

  const confirm = async () => {
    if (job) {
      router.push(`/export/bookings/${job._id}`)
      return
    }
    setDeleting(true)
    try {
      await quotationApi.deleteQuotation(quotation._id)
      toast(`Quotation ${quotation.quotationNo} deleted`, 'success')
      onDeleted()
    } catch (err) {
      toast(err.message, 'error')
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      onConfirm={confirm}
      loading={deleting}
      danger={!job}
      title={job ? 'Delete the job first' : 'Delete this quotation?'}
      message={
        job
          ? `Quotation ${quotation.quotationNo} has a job (${job.jobNo}). Delete that job / booking first, then you can delete the quotation.`
          : `Quotation ${quotation.quotationNo} (${quotation.clientName}) will be permanently deleted, including its MSDS files. This cannot be undone.`
      }
      confirmLabel={job ? `Open job ${job.jobNo}` : 'Delete permanently'}
    />
  )
}
