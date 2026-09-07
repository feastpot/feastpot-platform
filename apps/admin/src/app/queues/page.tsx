import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { QueuesClient } from './queues-client';

export const dynamic = 'force-dynamic';

export default async function QueuesPage() {
  const user = await requireStaff('/queues', ['admin']);
  return (
    <StaffShell user={user}>
      <QueuesClient accessToken={user.accessToken} />
    </StaffShell>
  );
}
