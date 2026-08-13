import { redirect } from 'next/navigation';

import { RoleGate } from '@/components/auth/role-gate';
import { PortalShell } from '@/components/layout/portal-shell';
import { ApiError, apiRequest } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { DishesClient } from './dishes-client';

// Reads cookies via the Supabase server client -- must be dynamic at runtime.
export const dynamic = 'force-dynamic';

interface VendorMe {
  id: string;
  businessName: string;
  status: string;
}

export default async function MenuPage() {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/menu');

  let vendor: VendorMe;
  try {
    vendor = await apiRequest<VendorMe>('/vendors/me', {
      accessToken: session.access_token,
      next: { revalidate: 0 },
    });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404))
      redirect('/unauthorized');
    throw err;
  }
  if (vendor.status !== 'live' && vendor.status !== 'probation') redirect('/onboarding');

  return (
    <PortalShell businessName={vendor.businessName}>
      <RoleGate path="/menu">
        <DishesClient vendorId={vendor.id} />
      </RoleGate>
    </PortalShell>
  );
}
