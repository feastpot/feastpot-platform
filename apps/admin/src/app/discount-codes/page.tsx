import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { DiscountCodesClient } from './discount-codes-client';

export const dynamic = 'force-dynamic';

export default async function DiscountCodesPage() {
  const user = await requireStaff('/discount-codes', ['admin', 'finance']);
  return (
    <StaffShell user={user}>
      <DiscountCodesClient canCreate={user.role === 'admin'} />
    </StaffShell>
  );
}
