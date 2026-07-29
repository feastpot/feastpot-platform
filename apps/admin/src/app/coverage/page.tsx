import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { CoverageClient } from './coverage-client';

export const dynamic = 'force-dynamic';

export default async function CoveragePage() {
  const user = await requireStaff('/coverage', ['admin', 'support']);
  return (
    <StaffShell user={user}>
      <CoverageClient />
    </StaffShell>
  );
}
