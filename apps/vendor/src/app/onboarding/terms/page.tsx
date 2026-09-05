import { redirect } from 'next/navigation';

import { PortalShell } from '@/components/layout/portal-shell';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { TermsAcceptanceClient } from './terms-acceptance-client';

export const dynamic = 'force-dynamic';

interface TermsVersion {
  id: string;
  version: string;
  effectiveAt: string;
  contentMdx: string;
  contentHash: string;
  changeSummary: string;
}

interface AcceptanceStatus {
  accepted: boolean;
}

interface VendorMe {
  businessName: string;
}

export default async function TermsAcceptancePage() {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/onboarding/terms');

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

  // Fetch the current live terms version (public endpoint -- no auth needed).
  let version: TermsVersion | null = null;
  try {
    version = await apiRequest<TermsVersion>('/terms/current?documentType=VENDOR_TERMS', {
      next: { revalidate: 0 },
    });
  } catch {
    // No live version published yet -- redirect back to onboarding.
    redirect('/onboarding');
  }
  if (!version) redirect('/onboarding');

  // Check whether this vendor has already accepted the current version.
  let alreadyAccepted = false;
  try {
    const status = await apiRequest<AcceptanceStatus>('/terms/acceptance-status', {
      accessToken: session.access_token,
      next: { revalidate: 0 },
    });
    alreadyAccepted = status.accepted;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
      redirect('/unauthorized');
    }
    throw err;
  }

  return (
    <PortalShell businessName={vendor.businessName}>
      <TermsAcceptanceClient
        accessToken={session.access_token}
        version={version}
        alreadyAccepted={alreadyAccepted}
      />
    </PortalShell>
  );
}
