import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { CateringClient } from './catering-client';

export const metadata = { title: 'Catering bookings | Feastpot Vendor' };

async function getVendor(accessToken: string) {
  const { default: apiUrl } = await import('@/lib/env').then((m) => ({ default: m.API_URL }));
  const res = await fetch(`${apiUrl}/v1/vendors/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 0 },
  });
  if (!res.ok) return null;
  return res.json() as Promise<{ id: string; status: string }>;
}

export default async function CateringPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/catering');

  const vendor = await getVendor(session.access_token);
  if (!vendor) redirect('/unauthorized');
  if (vendor.status !== 'live' && vendor.status !== 'probation') redirect('/onboarding');

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Catering bookings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Build quotes for catering enquiries routed to you by Feastpot.
        </p>
      </div>
      <CateringClient vendorId={vendor.id} />
    </div>
  );
}
