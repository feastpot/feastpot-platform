import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { VendorRecommendationsClient } from './vendor-recommendations-client';

export const dynamic = 'force-dynamic';

export default async function VendorRecommendationsPage() {
  const user = await requireStaff('/vendor-recommendations', ['admin', 'support']);
  return (
    <StaffShell user={user}>
      <VendorRecommendationsClient />
    </StaffShell>
  );
}
