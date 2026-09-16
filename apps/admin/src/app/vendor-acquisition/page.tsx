import { PageHeader } from '@/components/layout/page-header';
import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { VendorAcquisitionClient } from './vendor-acquisition-client';

export const dynamic = 'force-dynamic';

export default async function VendorAcquisitionPage() {
  const user = await requireStaff('/vendor-acquisition', ['admin', 'finance', 'support']);
  return (
    <StaffShell user={user}>
      <PageHeader
        title="Vendor acquisition"
        description="Follow the ordered journey from first visit to a live vendor, then open the leads that need recovery."
      />
      <VendorAcquisitionClient
        canSeeStuckLeads={user.role === 'admin' || user.role === 'support'}
      />
    </StaffShell>
  );
}
