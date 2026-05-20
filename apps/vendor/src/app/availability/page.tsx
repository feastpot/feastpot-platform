import { redirect } from 'next/navigation';

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
 * Availability & scheduling page (T002). Mirrors the /compliance gate:
 * pending / approved (pre-live) vendors get bounced to onboarding so
 * they finish the wizard first - scheduling is meaningless until the
 * vendor is live or in probation.
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
      <TopNav businessName={vendor.businessName} />
      <main className="container py-6">
        <AvailabilityClient initial={initial} />
      </main>
    </>
  );
}
