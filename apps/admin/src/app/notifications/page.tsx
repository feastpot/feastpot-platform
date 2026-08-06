import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { NotificationsClient } from './notifications-client';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const user = await requireStaff('/notifications', ['admin']);
  return (
    <StaffShell user={user}>
      <NotificationsClient />
    </StaffShell>
  );
}
