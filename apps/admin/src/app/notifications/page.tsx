import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  redirect('/dead-letters?tab=notifications');
}
