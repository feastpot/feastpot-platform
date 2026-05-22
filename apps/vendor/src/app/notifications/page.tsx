import { redirect } from 'next/navigation';

import { SideNav } from '@/components/layout/side-nav';
import { TopNav } from '@/components/layout/top-nav';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { NotificationsClient } from './notifications-client';

// Server-rendered cookie reads → must be dynamic at runtime.
export const dynamic = 'force-dynamic';

interface VendorMe {
  businessName: string;
  status: string;
}

/**
 * Standalone Notifications page. Any signed-in vendor user (Owner,
 * Manager, Cook) can see their inbox.
 *
 * Screen 8 of the vendor redesign — migrated to the SideNav shell
 * (with TopNav as a md:hidden mobile fallback).
 */
export default async function NotificationsPage() {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/notifications');

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

  return (
    <>
      <div className="md:hidden">
        <TopNav businessName={vendor.businessName} />
      </div>
      <div className="flex min-h-screen bg-surface">
        <SideNav businessName={vendor.businessName} />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-6">
          <NotificationsClient />
        </main>
      </div>
    </>
  );
}
