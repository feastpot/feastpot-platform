import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { AccountDeletionsClient } from './account-deletions-client';

export const dynamic = 'force-dynamic';

export default async function AccountDeletionsPage() {
  const user = await requireStaff('/account-deletions', ['admin']);
  return (
    <StaffShell user={user}>
      <AccountDeletionsClient role={user.role} />
    </StaffShell>
  );
}
