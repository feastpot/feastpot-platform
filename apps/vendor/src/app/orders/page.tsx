import { redirect } from 'next/navigation';

import { SideNav } from '@/components/layout/side-nav';
import { TopNav } from '@/components/layout/top-nav';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { OrdersDashboard } from './orders-dashboard';

// Reads cookies via Supabase server client → must be dynamic at runtime.
export const dynamic = 'force-dynamic';

interface VendorMe {
  id: string;
  businessName: string;
  status: 'pending' | 'approved' | 'live' | 'suspended' | 'probation' | 'removed';
}

/**
 * Server-side gate: confirm the user has the `vendor` role and a
 * vendor profile in (live | probation). Anything else bounces them —
 * auth handled at the edge in middleware.ts so we know `user` is
 * non-null here.
 *
 * Screen 2 of the vendor redesign — migrated to the SideNav shell
 * (with TopNav kept as a mobile fallback below `md`, same pattern as
 * the Dashboard). Other authed pages still render the legacy TopNav
 * until their own turn.
 */
export default async function OrdersPage() {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  // Middleware already redirected unauthed visitors; if we somehow got here
  // without a session, send them back to sign in.
  if (!session) redirect('/sign-in?next=/orders');

  let vendor: VendorMe;
  try {
    vendor = await apiRequest<VendorMe>('/vendors/me', {
      accessToken: session.access_token,
      // No client cache for the gate — it MUST reflect the latest status.
      next: { revalidate: 0 },
    });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
      // Not a vendor account, or vendor profile missing.
      redirect('/unauthorized');
    }
    throw err;
  }

  if (vendor.status !== 'live' && vendor.status !== 'probation') {
    redirect('/onboarding');
  }

  return (
    <>
      <div className="md:hidden">
        <TopNav businessName={vendor.businessName} />
      </div>
      <div className="flex min-h-screen bg-surface">
        <SideNav businessName={vendor.businessName} />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-6">
          <OrdersDashboard vendorId={vendor.id} />
        </main>
      </div>
    </>
  );
}
