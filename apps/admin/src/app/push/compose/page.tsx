import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { PushComposeClient } from './push-compose-client';

export const dynamic = 'force-dynamic';

export default async function PushComposePage() {
  const user = await requireStaff('/push/compose', ['admin']);
  return (
    <StaffShell user={user}>
      <PushComposeClient />
    </StaffShell>
  );
}
