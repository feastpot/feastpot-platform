import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { DashboardClient } from './dashboard-client';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireStaff('/');
  return (
    <StaffShell user={user}>
      <DashboardClient />
    </StaffShell>
  );
}
