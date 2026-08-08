import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { DocumentsClient } from './documents-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Legal documents | FeastPot Admin' };

export default async function DocumentsPage() {
  const user = await requireStaff('/legal/documents', ['admin', 'compliance']);
  return (
    <StaffShell user={user}>
      <DocumentsClient />
    </StaffShell>
  );
}
