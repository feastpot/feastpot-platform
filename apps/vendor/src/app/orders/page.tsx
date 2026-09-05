import { redirect } from 'next/navigation';

import { PortalShell } from '@/components/layout/portal-shell';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { OrdersDashboard } from './orders-dashboard';
import type { TypeFilter } from './orders-dashboard';

// Reads cookies via Supabase server client - must be dynamic at runtime.
export const dynamic = 'force-dynamic';

interface VendorMe {
  id: string;
  businessName: string;
  status: 'pending' | 'approved' | 'live' | 'suspended' | 'probation' | 'removed';
}

/**
 * Server-side gate: confirm the user has the vendor role and a vendor profile
 * in (live | probation). The ?type= param seeds the type filter on first load
 * so the /catering redirect lands with catering preselected.
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/orders');

  const params = await searchParams;
  const raw = params.type;
  const initialType: TypeFilter =
    raw === 'catering' ? 'catering' : raw === 'standard' ? 'standard' : 'all';

  let vendor: VendorMe;
  try {
    vendor = await apiRequest<VendorMe>('/vendors/me', {
      accessToken: session.access_token,
      next: { revalidate: 0 },
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) redirect('/unauthorized');
    // An Auth user may retain vendor metadata after an interrupted provisioning
    // flow, while having no corresponding platform profile. This is not an
    // onboarding state: show the explicit recovery route rather than bouncing
    // them into an authenticated onboarding page with no explanation.
    if (err instanceof ApiError && err.status === 404) redirect('/not-registered');
    throw err;
  }

  if (vendor.status !== 'live' && vendor.status !== 'probation') {
    redirect('/onboarding');
  }

  return (
    <PortalShell businessName={vendor.businessName}>
      <OrdersDashboard vendorId={vendor.id} initialType={initialType} />
    </PortalShell>
  );
}
