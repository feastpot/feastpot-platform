import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { VendorsClient } from './vendors-client';

export const dynamic = 'force-dynamic';

export default async function VendorsPage() {
  // Mirror backend AdminController role matrix (admin/compliance/support).
  const user = await requireStaff('/vendors', ['admin', 'compliance', 'support']);
  return (
    <StaffShell user={user}>
      <VendorsClient />
    </StaffShell>
  );
}
