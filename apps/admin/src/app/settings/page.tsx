import { Card, CardContent, CardHeader, CardTitle } from '@feastpot/ui';

import { PageHeader } from '@/components/layout/page-header';
import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireStaff('/settings', ['admin']);
  return (
    <StaffShell user={user}>
      <PageHeader title="Settings" description="Platform-wide configuration." />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coming soon</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Settings (commission defaults, payout schedule, role assignments) will live here in a later
          release. Use the audit log and per-vendor screens to manage the platform in the meantime.
        </CardContent>
      </Card>
    </StaffShell>
  );
}
