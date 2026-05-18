import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { AuditLogClient } from './audit-log-client';

export const dynamic = 'force-dynamic';

export default async function AuditLogPage() {
  // Backend restricts audit-log to admin + compliance - gate the page so
  // support / finance don't reach a perpetual 403.
  const user = await requireStaff('/audit-log', ['admin', 'compliance']);
  return (
    <StaffShell user={user}>
      <AuditLogClient />
    </StaffShell>
  );
}
