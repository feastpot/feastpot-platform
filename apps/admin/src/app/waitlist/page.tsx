import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { WaitlistClient } from './waitlist-client';

export const dynamic = 'force-dynamic';

export default async function WaitlistPage() {
  const user = await requireStaff('/waitlist', ['admin', 'support']);
  return (
    <StaffShell user={user}>
      <WaitlistClient />
    </StaffShell>
  );
}
