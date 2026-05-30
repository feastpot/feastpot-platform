import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { VendorApplicationDetailClient } from './vendor-application-detail-client';

export const dynamic = 'force-dynamic';

export default async function VendorApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Mirror backend AdminController role matrix for GET vendor-applications/:id.
  // Note: the PATCH / resend-invite actions are admin/compliance only — the
  // backend enforces that, so support sees the page read-only.
  const user = await requireStaff(`/vendor-applications/${id}`, [
    'admin',
    'compliance',
    'support',
  ]);
  // Mutating actions (PATCH / resend-invite) are admin/compliance only on the
  // backend, so support gets a read-only view.
  const canModerate = user.role === 'admin' || user.role === 'compliance';
  return (
    <StaffShell user={user}>
      <VendorApplicationDetailClient id={id} canModerate={canModerate} />
    </StaffShell>
  );
}
