import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { AppealsQueueClient } from './appeals-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Appeals queue | FeastPot Admin' };

export default async function AppealsPage() {
  const user = await requireStaff('/legal/appeals', ['admin', 'compliance', 'support']);
  return (
    <StaffShell user={user}>
      <AppealsQueueClient />
    </StaffShell>
  );
}
