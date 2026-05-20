import { redirect } from 'next/navigation';

import { TopNav } from '@/components/layout/top-nav';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { NotificationsClient } from './notifications-client';

// Server-rendered cookie reads → must be dynamic at runtime.
export const dynamic = 'force-dynamic';

interface VendorMe { businessName: string; status: string }

export default async function NotificationsPage() {
  const supabase = await createServerSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/notifications');

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

  return (
    <>
      <TopNav businessName={vendor.businessName} />
      <main className="container py-6">
        <NotificationsClient />
      </main>
    </>
  );
}
