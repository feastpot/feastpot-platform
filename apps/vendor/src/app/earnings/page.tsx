import { redirect } from 'next/navigation';

import { PortalShell } from '@/components/layout/portal-shell';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { EarningsClient } from './earnings-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Earnings & fees | Feastpot Vendor' };

export default async function EarningsPage() {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect('/sign-in?next=/earnings');

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
          <EarningsClient />
    </PortalShell>
  );
}
