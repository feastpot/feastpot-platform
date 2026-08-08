import { CalendarDays } from 'lucide-react';
import { redirect } from 'next/navigation';

import { PortalShell } from '@/components/layout/portal-shell';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient } from '@/lib/supabase/server';

import { CateringClient } from './catering-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Catering bookings | Feastpot Vendor' };

export default async function CateringPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/catering');

  let vendor: { id: string; businessName: string; status: string };
  try {
    vendor = await apiRequest('/vendors/me', {
      accessToken: session.access_token,
      next: { revalidate: 0 },
    });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
      redirect('/unauthorized');
    }
    throw err;
  }
  if (vendor.status !== 'live' && vendor.status !== 'probation') redirect('/onboarding');

  return (
    <PortalShell businessName={vendor.businessName}>
          <header className="mb-6 flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal/10">
              <CalendarDays className="h-5 w-5 text-teal" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-dark">Catering bookings</h1>
              <p className="mt-1 text-sm text-mid">
                Build quotes for catering enquiries routed to you by Feastpot.
              </p>
            </div>
          </header>
          <CateringClient vendorId={vendor.id} />
    </PortalShell>
  );
}
