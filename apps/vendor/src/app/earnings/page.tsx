import { redirect } from 'next/navigation';

// Earnings & fees has been merged into the Performance screen.
export default function EarningsPage() {
  redirect('/performance');
}
