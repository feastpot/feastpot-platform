import { redirect } from 'next/navigation';

import { SideNav } from '@/components/layout/side-nav';
import { TopNav } from '@/components/layout/top-nav';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { TermsClient } from './terms-client';

export const dynamic = 'force-dynamic';

interface VendorMe {
  id: string;
  businessName: string;
  status: string;
}

interface TermsVersion {
  id: string;
  documentType: string;
  version: string;
  summary: string;
  publishedAt: string;
  effectiveAt: string;
  accepted: boolean;
}

interface HistoryEntry extends Omit<TermsVersion, 'accepted'> {
  acceptedAt: string | null;
}

export default async function TermsPage() {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/terms');

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

  // Fetch terms data server-side for the initial render.
  const [view, history] = await Promise.all([
    apiRequest<{ current: TermsVersion | null; pending: TermsVersion | null }>(
      '/terms/versions/me?documentType=VENDOR_TERMS',
      { accessToken: session.access_token, next: { revalidate: 0 } },
    ).catch(() => ({ current: null, pending: null })),
    apiRequest<HistoryEntry[]>(
      '/terms/versions/me/history?documentType=VENDOR_TERMS',
      { accessToken: session.access_token, next: { revalidate: 0 } },
    ).catch(() => [] as HistoryEntry[]),
  ]);

  return (
    <>
      <div className="md:hidden">
        <TopNav businessName={vendor.businessName} />
      </div>
      <div className="flex min-h-screen bg-surface">
        <SideNav businessName={vendor.businessName} />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-6">
          <header className="mb-6">
            <h1 className="text-xl font-bold text-dark">Terms &amp; Notices</h1>
            <p className="mt-1 text-sm text-mid">
              Your current agreement with Feastpot, change history, and acknowledgement record.
            </p>
          </header>
          <TermsClient view={view} history={history} />
        </main>
      </div>
    </>
  );
}
