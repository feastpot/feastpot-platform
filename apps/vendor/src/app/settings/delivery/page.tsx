import { redirect } from 'next/navigation';

import { TopNav } from '@/components/layout/top-nav';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { DeliveryForm } from './delivery-form';

// Reads cookies via Supabase server client → must be dynamic at runtime.
export const dynamic = 'force-dynamic';

interface VendorMe { id: string; businessName: string; status: string }

export default async function DeliverySettingsPage() {
  const supabase = await createServerSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/settings/delivery');

  let vendor: VendorMe;
  try {
    vendor = await apiRequest<VendorMe>('/vendors/me', {
      accessToken: session.access_token,
      next: { revalidate: 0 },
    });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) redirect('/unauthorized');
    throw err;
  }
  // Note: settings/delivery is reachable from any non-pending status so the
  // vendor can update config while approved-but-not-yet-live.
  if (vendor.status === 'pending' || vendor.status === 'removed') redirect('/onboarding');

  return (
    <>
      <TopNav businessName={vendor.businessName} />
      <main className="container py-6">
        <DeliveryForm />
      </main>
    </>
  );
}
