import { redirect } from 'next/navigation'

// The separate Step 1/Step 2 (then single-form) edit page was folded into
// the unified "Booking & Job Details" page — editing now happens inline,
// per step, on /export/bookings/[id] itself. Kept as a redirect (not
// deleted outright) so old bookmarks/links still land somewhere useful.
export default async function BookingEditRedirect({ params }) {
  const { id } = await params
  redirect(`/export/bookings/${id}`)
}
