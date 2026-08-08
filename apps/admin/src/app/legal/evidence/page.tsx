import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { EvidenceExportClient } from './evidence-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Evidence export | FeastPot Admin' };

export default async function EvidencePage() {
  const user = await requireStaff('/legal/evidence', ['admin', 'compliance']);
  return (
    <StaffShell user={user}>
      <EvidenceExportClient />
    </StaffShell>
  );
}
