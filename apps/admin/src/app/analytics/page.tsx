import { PageHeader } from '@/components/layout/page-header';
import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { AnalyticsClient } from './analytics-client';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Vendor acquisition analytics',
};

export default async function AnalyticsPage() {
  const user = await requireStaff('/analytics', ['admin', 'finance', 'support']);
  return (
    <StaffShell user={user}>
      <PageHeader
        title="Vendor acquisition analytics"
        description="Funnel drop-offs, share activity, and order attribution for the vendor acquisition flow."
      />
      <div className="mt-6">
        <AnalyticsClient role={user.role} accessToken={user.accessToken} />
      </div>
    </StaffShell>
  );
}
