import { redirect } from 'next/navigation';

import { TopNav } from '@/components/layout/top-nav';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { DashboardClient } from './dashboard-client';

// Reads cookies via Supabase server client → must be dynamic at runtime.
export const dynamic = 'force-dynamic';

/**
 * Vendor /me payload - widened from the orders/menu pages to also pull
 * `rating` so the dashboard rating card has a real value on first paint.
 * Both rating fields are typed as optional because the API may omit them
 * for brand-new vendors.
 */
interface VendorMe {
  id: string;
  businessName: string;
  status: 'pending' | 'approved' | 'live' | 'suspended' | 'probation' | 'removed';
  rating?: number | null;
  ratingCount?: number | null;
}

/**
 * Vendor dashboard home. Replaces the previous redirect-to-/orders so
 * vendors land on a personalised greeting + today's metrics + quick links.
 * Auth gate mirrors /orders, /menu, /analytics - they all do the same
 * `/vendors/me` round-trip because Next 15 segment layouts can't read the
 * session before render.
 */
export default async function DashboardPage() {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/');

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

  if (vendor.status !== 'live' && vendor.status !== 'probation') {
    redirect('/onboarding');
  }

  // Friendly first name: take the first word of the business name. The
  // API doesn't expose the owner's first name on /vendors/me today; if
  // it ever does, swap this to vendor.ownerFirstName.
  const greetingName = vendor.businessName.split(/\s+/)[0] ?? 'there';

  return (
    <>
      <TopNav businessName={vendor.businessName} />
      <main className="container py-6">
        <DashboardClient
          greetingName={greetingName}
          businessName={vendor.businessName}
          rating={typeof vendor.rating === 'number' ? vendor.rating : null}
        />
      </main>
    </>
  );
}
