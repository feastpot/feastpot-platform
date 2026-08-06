import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { CommissionRatesClient } from './commission-rates-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Commission rates | Feastpot Admin' };

export default async function CommissionRatesPage() {
  const user = await requireStaff('/commission-rates', ['admin', 'finance']);

  return (
    <StaffShell user={user}>
      <CommissionRatesClient />
    </StaffShell>
  );
}
