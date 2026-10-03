import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { StorageReportClient } from './storage-report-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Storage reconciliation | Feastpot Admin' };

export default async function StorageReconciliationPage() {
  const user = await requireStaff('/storage-reconciliation', ['admin', 'compliance']);
  return (
    <StaffShell user={user}>
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <h1 className="text-2xl font-bold">Storage reconciliation</h1>
        <p className="text-sm text-muted-foreground">
          Daily at 04:00 UTC. Reports never delete discovered orphans. Review both unreferenced
          files and references to missing files before deciding what to do.
        </p>
        <StorageReportClient accessToken={user.accessToken} />
      </div>
    </StaffShell>
  );
}
