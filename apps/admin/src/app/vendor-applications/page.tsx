import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { VendorApplicationsClient } from './vendor-applications-client';

export const dynamic = 'force-dynamic';

export default async function VendorApplicationsPage() {
  // Mirror backend AdminController role matrix for GET vendor-applications.
  const user = await requireStaff('/vendor-applications', ['admin', 'compliance', 'support']);
  return (
    <StaffShell user={user}>
      <VendorApplicationsClient />
    </StaffShell>
  );
}
