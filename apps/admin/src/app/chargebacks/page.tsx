import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { ChargebacksClient } from './chargebacks-client';

export const dynamic = 'force-dynamic';

export default async function ChargebacksPage() {
  const user = await requireStaff('/chargebacks', ['admin', 'finance']);
  return (
    <StaffShell user={user}>
      <ChargebacksClient />
    </StaffShell>
  );
}
