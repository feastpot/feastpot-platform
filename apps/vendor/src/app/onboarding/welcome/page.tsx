import { redirect } from 'next/navigation';

import { PortalShell } from '@/components/layout/portal-shell';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { WelcomeClient, type OnboardingProgress } from './welcome-client';

// Reads cookies via Supabase server client → must be dynamic at runtime.
export const dynamic = 'force-dynamic';

interface VendorMe {
  id: string;
  businessName: string;
  status: 'pending' | 'approved' | 'live' | 'suspended' | 'probation' | 'removed';
}

/**
 * First-login welcome screen. The dashboard redirects vendors here while
 * their kitchen isn't live yet (see apps/vendor/src/app/page.tsx). It shows
 * a 5-step setup checklist driven by GET /vendors/me/onboarding-progress.
 *
 * Completion is tracked via `Vendor.status` (there is no
 * `onboardingCompletedAt` column), so once a vendor is live/probation we
 * send them back to the dashboard rather than showing the welcome list.
 */
export default async function OnboardingWelcomePage() {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/onboarding/welcome');

  let vendor: VendorMe;
  let progress: OnboardingProgress;
  try {
    [vendor, progress] = await Promise.all([
      apiRequest<VendorMe>('/vendors/me', {
        accessToken: session.access_token,
        next: { revalidate: 0 },
      }),
      apiRequest<OnboardingProgress>('/vendors/me/onboarding-progress', {
        accessToken: session.access_token,
        next: { revalidate: 0 },
      }),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) redirect('/unauthorized');
    // 404 here means either no vendor profile yet or no onboarding-progress
    // record yet (normal for new vendors). Neither is an access error.
    if (err instanceof ApiError && err.status === 404) redirect('/onboarding');
    throw err;
  }

  if (vendor.status === 'live' || vendor.status === 'probation') redirect('/');

  return (
    <PortalShell businessName={vendor.businessName}>
      <WelcomeClient businessName={vendor.businessName} progress={progress} />
    </PortalShell>
  );
}
