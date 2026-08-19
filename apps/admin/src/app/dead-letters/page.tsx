import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { DeadLettersClient } from './dead-letters-client';

export default async function DeadLettersPage() {
  const user = await requireStaff('/dead-letters', ['admin']);
  return (
    <StaffShell user={user}>
      <DeadLettersClient />
    </StaffShell>
  );
}
