import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { EnquiryDetailClient } from './enquiry-detail-client';

export const dynamic = 'force-dynamic';

interface PageProps {
  // Next 15: dynamic route params arrive as a Promise on the server.
  params: Promise<{ enquiryId: string }>;
}

export default async function AdminEventEnquiryDetailPage({ params }: PageProps) {
  const { enquiryId } = await params;
  const user = await requireStaff(`/events/${enquiryId}`, ['admin', 'support']);
  return (
    <StaffShell user={user}>
      <EnquiryDetailClient enquiryId={enquiryId} />
    </StaffShell>
  );
}
