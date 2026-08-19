import { redirect } from 'next/navigation';

/**
 * Absorbed into the unified /catering section.
 * Bookmarked links and old nav entries land here and are forwarded.
 */
export default function CateringBookingsRedirect() {
  redirect('/catering?tab=bookings');
}
