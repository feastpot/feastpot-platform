import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { SupplyPipelineClient } from './supply-pipeline-client';

export const dynamic = 'force-dynamic';

export default async function SupplyPipelinePage() {
  const user = await requireStaff('/supply-pipeline', ['admin', 'compliance', 'support']);
  return (
    <StaffShell user={user}>
      <SupplyPipelineClient
        canIncludeTestData={user.role === 'admin'}
        canRequestInformation={user.role === 'admin' || user.role === 'compliance'}
      />
    </StaffShell>
  );
}
