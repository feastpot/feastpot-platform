import { redirect } from 'next/navigation';

// The Catering bookings screen has been merged into the Orders screen.
// Incoming links and bookmarks are preserved via this redirect with the
// catering type filter preselected.
export const dynamic = 'force-dynamic';

export default function CateringPage() {
  redirect('/orders?type=catering');
}
