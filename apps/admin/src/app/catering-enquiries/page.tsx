import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { CateringEnquiriesClient } from './catering-enquiries-client';

export const dynamic = 'force-dynamic';

export default async function CateringEnquiriesPage() {
  const user = await requireStaff('/catering-enquiries', ['admin', 'support']);
  return (
    <StaffShell user={user}>
      <CateringEnquiriesClient />
    </StaffShell>
  );
}
