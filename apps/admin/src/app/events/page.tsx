import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { EventsClient } from './events-client';

export const dynamic = 'force-dynamic';

export default async function AdminEventsPage() {
  const user = await requireStaff('/events', ['admin', 'support']);
  return (
    <StaffShell user={user}>
      <EventsClient />
    </StaffShell>
  );
}
