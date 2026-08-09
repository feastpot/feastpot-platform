import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { LegalDashboardClient } from './legal-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Legal ops | Feastpot Admin' };

export default async function LegalPage() {
  const user = await requireStaff('/legal', ['admin', 'compliance']);
  return (
    <StaffShell user={user}>
      <LegalDashboardClient />
    </StaffShell>
  );
}
