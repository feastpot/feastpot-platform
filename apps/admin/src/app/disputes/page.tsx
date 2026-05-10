import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { DisputesClient } from './disputes-client';

export const dynamic = 'force-dynamic';

export default async function DisputesPage() {
  const user = await requireStaff('/disputes', ['admin', 'support']);
  return (
    <StaffShell user={user}>
      <DisputesClient />
    </StaffShell>
  );
}
