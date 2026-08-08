import { redirect } from 'next/navigation';

import { RoleGate } from '@/components/auth/role-gate';
import { PortalShell } from '@/components/layout/portal-shell';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { DisputesClient } from './disputes-client';

// Reads cookies via Supabase server client → must be dynamic at runtime.
export const dynamic = 'force-dynamic';

interface VendorMe {
  id: string;
  businessName: string;
  status: string;
}

/**
 * Disputes list page. Vendors land here (often via a deep-link from a
 * dispute email) to see disputes raised against their orders and respond.
 *
 * Mirrors the Orders/Payouts auth shell exactly: server-side gate via the
 * Supabase session + `/vendors/me`, SideNav layout with a TopNav mobile
 * fallback, and a client component for the interactive body.
 */
export default async function DisputesPage() {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/disputes');

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
    <PortalShell businessName={vendor.businessName}>
          <RoleGate path="/disputes">
            <DisputesClient />
          </RoleGate>
    </PortalShell>
  );
}
