import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { CoverageClient } from './coverage-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Acceptance coverage | FeastPot Admin' };

export default async function CoveragePage() {
  const user = await requireStaff('/legal/coverage', ['admin', 'compliance', 'support']);
  return (
    <StaffShell user={user}>
      <CoverageClient />
    </StaffShell>
  );
}
