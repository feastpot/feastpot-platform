import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { UsersClient } from './users-client';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  // Mirror backend role matrix: admin + support can search; mutations are
  // gated again on the API side per-action (suspend = admin only,
  // credit = admin/finance, etc).
  const user = await requireStaff('/users', ['admin', 'support', 'finance', 'compliance']);
  return (
    <StaffShell user={user}>
      <UsersClient currentUserId={user.id} role={user.role} />
    </StaffShell>
  );
}
