import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { SettingsClient } from './settings-client';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireStaff('/settings', ['admin']);
  return (
    <StaffShell user={user}>
      <SettingsClient user={user} />
    </StaffShell>
  );
}
