import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { VendorsClient } from './vendors-client';

export const dynamic = 'force-dynamic';

export default async function VendorsPage() {
  const user = await requireStaff('/vendors', ['admin', 'compliance']);
  return (
    <StaffShell user={user}>
      <VendorsClient />
    </StaffShell>
  );
}
