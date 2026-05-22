import { redirect } from 'next/navigation';

import { SideNav } from '@/components/layout/side-nav';
import { TopNav } from '@/components/layout/top-nav';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { ProfileForm } from './profile-form';

// Reads cookies via Supabase server client → must be dynamic at runtime.
export const dynamic = 'force-dynamic';

interface VendorMe { id: string; businessName: string; status: string }

/**
 * Business profile page. Screen 5 of the vendor redesign — migrated
 * to the SideNav shell (with TopNav as a md:hidden mobile fallback),
 * matching the Dashboard / Orders / Menu / Availability pattern.
 */
export default async function ProfileSettingsPage() {
  const supabase = await createServerSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/settings/profile');

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
  if (vendor.status === 'pending' || vendor.status === 'removed') redirect('/onboarding');

  return (
    <>
      <div className="md:hidden">
        <TopNav businessName={vendor.businessName} />
      </div>
      <div className="flex min-h-screen bg-surface">
        <SideNav businessName={vendor.businessName} />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-6">
          <ProfileForm />
        </main>
      </div>
    </>
  );
}
