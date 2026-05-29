import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { MenusQueueClient } from './menus-queue-client';

export const dynamic = 'force-dynamic';

export default async function MenusQueuePage() {
  // Moderate (PATCH) is admin-only on the API, so only admins should see this
  // page even though support can technically read the queue.
  const user = await requireStaff('/menus/queue', ['admin']);
  return (
    <StaffShell user={user}>
      <MenusQueueClient />
    </StaffShell>
  );
}
