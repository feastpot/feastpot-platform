import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { AuditLogClient } from './audit-log-client';

export const dynamic = 'force-dynamic';

export default async function AuditLogPage() {
  const user = await requireStaff('/audit-log');
  return (
    <StaffShell user={user}>
      <AuditLogClient />
    </StaffShell>
  );
}
