import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';

import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { CateringBookingsClient } from './catering-bookings-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Catering bookings | Feastpot Admin' };

export default async function CateringBookingsPage() {
  const user = await requireStaff('/catering-bookings', ['admin', 'finance', 'support']);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:3001';

  return (
    <StaffShell user={user}>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Catering bookings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor all catering bookings across vendors. Commission is source-based (referred = {PLATFORM_FACTS.commission.vendorReferred}%,
            marketplace repeat = {PLATFORM_FACTS.commission.marketplaceRepeat}%, marketplace first = {PLATFORM_FACTS.commission.marketplaceFirst}%).
          </p>
        </div>
        <CateringBookingsClient accessToken={user.accessToken} apiUrl={apiUrl} />
      </div>
    </StaffShell>
  );
}
