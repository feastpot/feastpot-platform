import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { PayoutsClient } from './payouts-client';

export const dynamic = 'force-dynamic';

export default async function PayoutsPage() {
  const user = await requireStaff('/payouts', ['admin', 'finance']);
  return (
    <StaffShell user={user}>
      <PayoutsClient />
    </StaffShell>
  );
}
