import { redirect } from 'next/navigation';

// Analytics has been merged into the Performance screen.
export default function AnalyticsPage() {
  redirect('/performance');
}
