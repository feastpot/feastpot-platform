import { redirect } from 'next/navigation';

import { SideNav } from '@/components/layout/side-nav';
import { TopNav } from '@/components/layout/top-nav';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { AccountStatusClient } from './account-status-client';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Account status',
  description:
    'View any active enforcement actions on your Feastpot listing and your right of appeal.',
};

export default async function AccountStatusPage() {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/account-status');

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
    <>
      <div className="md:hidden">
        <TopNav businessName={vendor.businessName} />
      </div>
      <div className="flex min-h-screen bg-surface">
        <SideNav businessName={vendor.businessName} />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-6">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-dark">Account status</h1>
            <p className="mt-1 text-sm text-mid">
              Any active restrictions, suspensions, or termination notices on your listing. Every
              action includes a written statement of reasons (vendor terms clause 14.1) and your
              right to appeal (clause 18.1).
            </p>
          </div>
          <AccountStatusClient />
        </main>
      </div>
    </>
  );
}
