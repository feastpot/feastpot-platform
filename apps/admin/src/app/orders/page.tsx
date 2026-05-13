import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { OrdersClient } from './orders-client';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const user = await requireStaff('/orders', ['admin', 'support', 'finance']);
  return (
    <StaffShell user={user}>
      <OrdersClient role={user.role} />
    </StaffShell>
  );
}
