import { redirect } from 'next/navigation';

import { SideNav } from '@/components/layout/side-nav';
import { TopNav } from '@/components/layout/top-nav';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { AvailabilityClient, type AvailabilitySnapshot } from './availability-client';

export const dynamic = 'force-dynamic';

interface VendorMe {
  id: string;
  businessName: string;
  status: 'pending' | 'approved' | 'live' | 'suspended' | 'probation' | 'removed';
}

/**
 * Availability & scheduling page. Mirrors the /compliance gate:
 * pending / approved (pre-live) vendors get bounced to onboarding
 * so they finish the wizard first — scheduling is meaningless
 * until the vendor is live or in probation.
 *
 * Screen 4 of the vendor redesign — migrated to the SideNav shell
 * (with TopNav as a md:hidden mobile fallback, matching the
 * Dashboard / Orders / Menu pattern).
 */
export default async function AvailabilityPage() {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/availability');

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

  if (vendor.status === 'pending' || vendor.status === 'approved') {
    redirect('/onboarding');
  }

  // SSR-fetch the snapshot so the form hydrates with real values rather
  // than the all-defaults flash you get with client-only fetches.
  const initial = await apiRequest<AvailabilitySnapshot>('/vendors/me/availability', {
    accessToken: session.access_token,
    next: { revalidate: 0 },
  });

  return (
    <>
      <div className="md:hidden">
        <TopNav businessName={vendor.businessName} />
      </div>
      <div className="flex min-h-screen bg-surface">
        <SideNav businessName={vendor.businessName} />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-6">
          <AvailabilityClient initial={initial} />
        </main>
      </div>
    </>
  );
}
