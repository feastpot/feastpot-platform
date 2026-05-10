import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { DisputeDetailClient } from './dispute-detail-client';

export const dynamic = 'force-dynamic';

export default async function DisputeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStaff(`/disputes/${id}`, ['admin', 'support']);
  return (
    <StaffShell user={user}>
      <DisputeDetailClient disputeId={id} />
    </StaffShell>
  );
}
