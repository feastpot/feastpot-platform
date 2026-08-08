import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { DocVersionClient } from './doc-version-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Document version | FeastPot Admin' };

export default async function DocVersionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff('/legal/documents', ['admin', 'compliance']);
  const { id } = await params;
  return (
    <StaffShell user={user}>
      <DocVersionClient id={id} />
    </StaffShell>
  );
}
