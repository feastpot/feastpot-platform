import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';

import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { CateringClient } from './catering-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Catering | Feastpot Admin' };

export default async function CateringPage() {
  const user = await requireStaff('/catering', ['admin', 'support', 'finance']);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:3001';
  return (
    <StaffShell user={user}>
      <CateringClient
        role={user.role}
        accessToken={user.accessToken}
        apiUrl={apiUrl}
        commissionFacts={PLATFORM_FACTS.commission}
      />
    </StaffShell>
  );
}
