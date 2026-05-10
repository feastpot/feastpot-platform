import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { VendorDetailClient } from './vendor-detail-client';

export const dynamic = 'force-dynamic';

export default async function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Mirror backend AdminController role matrix (admin/compliance/support).
  const user = await requireStaff(`/vendors/${id}`, ['admin', 'compliance', 'support']);
  return (
    <StaffShell user={user}>
      <VendorDetailClient vendorId={id} />
    </StaffShell>
  );
}
