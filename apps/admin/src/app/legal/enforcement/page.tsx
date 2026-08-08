import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { EnforcementLogClient } from './enforcement-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Enforcement log | FeastPot Admin' };

export default async function EnforcementLogPage() {
  const user = await requireStaff('/legal/enforcement', ['admin', 'compliance']);
  return (
    <StaffShell user={user}>
      <EnforcementLogClient />
    </StaffShell>
  );
}
