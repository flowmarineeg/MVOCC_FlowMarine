import { redirect } from 'next/navigation'

// The standalone B&L list was folded into the "Booking & Job" list, which
// now serves bl:read-only viewers too (see bookings/page.jsx). Kept as a
// redirect (not deleted outright) so old bookmarks/links still land
// somewhere useful.
export default function BLListRedirect() {
  redirect('/export/bookings')
}
