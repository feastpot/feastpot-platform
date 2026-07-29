import { redirect } from 'next/navigation';

import { RoleGate } from '@/components/auth/role-gate';
import { SideNav } from '@/components/layout/side-nav';
import { TopNav } from '@/components/layout/top-nav';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { DisputeDetailClient } from './dispute-detail-client';

// Reads cookies via Supabase server client → must be dynamic at runtime.
export const dynamic = 'force-dynamic';

interface VendorMe {
  id: string;
  businessName: string;
  status: string;
}

/**
 * Dispute detail page. This is the target of the deep-link in vendor
 * dispute emails (https://vendor.feastpot.co.uk/disputes/<id>). The auth
 * shell mirrors the Orders/Payouts pages exactly; the interactive body
 * (evidence, response form, uploads) lives in the client component.
 */
export default async function DisputeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect(`/sign-in?next=/disputes/${id}`);

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
    <>
      <div className="md:hidden">
        <TopNav businessName={vendor.businessName} />
      </div>
      <div className="flex min-h-screen bg-surface">
        <SideNav businessName={vendor.businessName} />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-6">
          <RoleGate path="/disputes">
            <DisputeDetailClient disputeId={id} />
          </RoleGate>
        </main>
      </div>
    </>
  );
}
