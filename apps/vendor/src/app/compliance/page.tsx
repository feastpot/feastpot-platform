import { redirect } from 'next/navigation';

import { SideNav } from '@/components/layout/side-nav';
import { TopNav } from '@/components/layout/top-nav';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { ComplianceClient, type VerificationRecord } from './compliance-client';

export const dynamic = 'force-dynamic';

interface VendorMe {
  id: string;
  businessName: string;
  status: 'pending' | 'approved' | 'live' | 'suspended' | 'probation' | 'removed';
}

/**
 * Standalone Compliance & Documents page. Live (and probation) vendors
 * land here to view, replace, or re-upload any compliance document at
 * any time after onboarding. Pending vendors are bounced back to
 * onboarding so they see the full wizard context (Stripe, profile,
 * menu) alongside docs.
 *
 * Screen 6 of the vendor redesign - migrated to the SideNav shell
 * (with TopNav as a md:hidden mobile fallback).
 *
 * Also fetches the vendor's verification record (GET /vendors/:id/verification)
 * and passes it down so the page can display the read-only verification status
 * section above the document upload section.
 */
export default async function CompliancePage() {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/compliance');

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

  if (vendor.status === 'pending' || vendor.status === 'approved') {
    redirect('/onboarding');
  }

  // Fetch verification record - public endpoint, no auth required.
  // Returns null if no record has been created yet (admin hasn't
  // completed the verification intake for this vendor).
  let verification: VerificationRecord | null = null;
  try {
    verification = await apiRequest<VerificationRecord>(
      `/vendors/${vendor.id}/verification`,
      { next: { revalidate: 0 } },
    );
  } catch {
    // Any error (404 = no record yet; 5xx = table absent in this env)
    // should leave verification as null and render the empty state,
    // not surface an error boundary. The ComplianceClient handles null.
  }

  return (
    <>
      <div className="md:hidden">
        <TopNav businessName={vendor.businessName} />
      </div>
      <div className="flex min-h-screen bg-surface">
        <SideNav businessName={vendor.businessName} />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-6">
          <ComplianceClient vendor={vendor} verification={verification} />
        </main>
      </div>
    </>
  );
}
