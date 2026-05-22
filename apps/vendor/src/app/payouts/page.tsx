import { redirect } from 'next/navigation';

import { RoleGate } from '@/components/auth/role-gate';
import { SideNav } from '@/components/layout/side-nav';
import { TopNav } from '@/components/layout/top-nav';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { PayoutsClient } from './payouts-client';

// Reads cookies via Supabase server client → must be dynamic at runtime.
export const dynamic = 'force-dynamic';

interface VendorMe {
  id: string;
  businessName: string;
  status: string;
}

/**
 * Standalone Payouts page. Live (and probation) vendors land here to
 * see their weekly transfer history, pending totals, and a payout-
 * cadence explainer.
 *
 * Screen 7 of the vendor redesign — migrated to the SideNav shell
 * (with TopNav as a md:hidden mobile fallback). All explainer copy
 * and the payouts table now live inside `<PayoutsClient />` so the
 * page shell stays a thin auth wrapper.
 */
export default async function PayoutsPage() {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/payouts');

  let vendor: VendorMe;
  try {
    vendor = await apiRequest<VendorMe>('/vendors/me', {
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
    <>
      <div className="md:hidden">
        <TopNav businessName={vendor.businessName} />
      </div>
      <div className="flex min-h-screen bg-surface">
        <SideNav businessName={vendor.businessName} />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-6">
          <RoleGate path="/payouts">
            <PayoutsClient />
          </RoleGate>
        </main>
      </div>
    </>
  );
}
