import { redirect } from 'next/navigation';

import { PortalShell } from '@/components/layout/portal-shell';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import {
  AccountAndComplianceClient,
  type TermsViewData,
  type TermsHistoryEntry,
} from './account-and-compliance-client';
import type { VerificationRecord } from '../compliance/compliance-client';

export const dynamic = 'force-dynamic';

interface VendorMe {
  id: string;
  businessName: string;
  status: 'pending' | 'approved' | 'live' | 'suspended' | 'probation' | 'removed';
  complianceStatus: 'RATED' | 'REGISTERED_AWAITING_INSPECTION' | 'NOT_ELIGIBLE';
  fsaHygieneRating: number | null;
  fsaRatingDate: string | null;
  fsaRegistrationNumber: string | null;
}

/**
 * Merged "Account and compliance" page.
 *
 * Replaces three separate pages (/compliance, /account-status, /terms) with a
 * single scrollable screen that shows all account-health content in one place:
 *
 *   1. Standing       - active enforcement actions (most urgent, always first)
 *   2. Compliance     - FSA compliance, verification record, document uploads
 *   3. Terms & notices - current/pending terms, acceptance record, change history
 *
 * Data that is expensive or auth-gated (verification record, terms) is fetched
 * here in the server component so the initial render is fully hydrated.
 * Enforcement actions and compliance documents are fetched client-side by their
 * existing hooks (useAccountStatus, useVendorDocuments) since they are already
 * optimised for that pattern.
 */
export default async function AccountAndCompliancePage() {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/account-and-compliance');

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

  // Bounce pre-onboarding vendors back to the wizard.
  if (vendor.status === 'pending' || vendor.status === 'approved') {
    redirect('/onboarding');
  }

  // Fetch verification record, terms view, and terms history in parallel.
  // Every fetch has its own catch so a single failure never prevents the
  // rest of the page from rendering.
  const [verification, termsView, termsHistory] = await Promise.all([
    apiRequest<VerificationRecord>(`/vendors/${vendor.id}/verification`, {
      next: { revalidate: 0 },
    }).catch(() => null),

    apiRequest<TermsViewData>('/terms/versions/me?documentType=VENDOR_TERMS', {
      accessToken: session.access_token,
      next: { revalidate: 0 },
    }).catch(() => ({ current: null, pending: null }) satisfies TermsViewData),

    apiRequest<TermsHistoryEntry[]>('/terms/versions/me/history?documentType=VENDOR_TERMS', {
      accessToken: session.access_token,
      next: { revalidate: 0 },
    }).catch(() => [] as TermsHistoryEntry[]),
  ]);

  return (
    <PortalShell businessName={vendor.businessName}>
      <AccountAndComplianceClient
        vendor={vendor}
        verification={verification}
        termsView={termsView}
        termsHistory={termsHistory}
      />
    </PortalShell>
  );
}
