import { PageHeader } from '@/components/layout/page-header';
import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { AttributionClient } from './attribution-client';

export const dynamic = 'force-dynamic';

export default async function AttributionPage() {
  const user = await requireStaff('/attribution', ['admin', 'finance', 'support']);
  return (
    <StaffShell user={user}>
      <PageHeader
        title="Order attribution"
        description="Source breakdown for every delivered order. Rows with source 'Vendor referred' arrived via a vendor's share link."
      />
      <div className="mt-6">
        <AttributionClient role={user.role} />
      </div>
    </StaffShell>
  );
}
