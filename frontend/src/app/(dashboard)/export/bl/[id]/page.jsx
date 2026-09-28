import { redirect } from 'next/navigation'

// B&L was folded into the unified "Booking & Job Details" page (Steps 4 & 5)
// — see docs/BOOKING_JOB_MERGE_DATA_REPORT.md. Kept as a redirect (not
// deleted outright) so old bookmarks/links still land somewhere useful.
export default async function BLDetailRedirect({ params }) {
  const { id } = await params
  redirect(`/export/bookings/${id}`)
}
