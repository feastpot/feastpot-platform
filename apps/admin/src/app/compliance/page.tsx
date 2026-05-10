import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { ComplianceClient } from './compliance-client';

export const dynamic = 'force-dynamic';

export default async function CompliancePage() {
  const user = await requireStaff('/compliance', ['admin', 'compliance']);
  return (
    <StaffShell user={user}>
      <ComplianceClient />
    </StaffShell>
  );
}
