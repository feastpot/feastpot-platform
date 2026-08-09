import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { NoticesClient } from './notices-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Notice delivery | Feastpot Admin' };

export default async function NoticesPage() {
  const user = await requireStaff('/legal/notices', ['admin', 'compliance', 'support']);
  return (
    <StaffShell user={user}>
      <NoticesClient />
    </StaffShell>
  );
}
