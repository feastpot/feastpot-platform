import { redirect } from 'next/navigation';

import { TopNav } from '@/components/layout/top-nav';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { OnboardingClient } from './onboarding-client';

// Reads cookies via Supabase server client → must be dynamic at runtime.
export const dynamic = 'force-dynamic';

interface VendorMe {
  id: string;
  businessName: string;
  status: string;
  description: string | null;
  cuisines: string[];
  stripeAccountId: string | null;
  payoutsEnabled: boolean;
}

/**
 * Onboarding is reachable in two situations:
 *   1. The vendor is `pending` and the orders gate sent them here.
 *   2. The vendor returns from a Stripe Connect redirect (?stripe=return).
 *
 * Either way we render the multi-step client and let it figure out the
 * appropriate step based on the current vendor profile.
 */
export default async function OnboardingPage() {
  const supabase = await createServerSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/onboarding');

  let vendor: VendorMe;
  try {
    vendor = await apiRequest<VendorMe>('/vendors/me', {
      accessToken: session.access_token,
      next: { revalidate: 0 },
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // Not a vendor yet - would need /vendors POST. Out of scope here.
      redirect('/unauthorized');
    }
    if (err instanceof ApiError && err.status === 403) redirect('/unauthorized');
    throw err;
  }

  return (
    <>
      <TopNav businessName={vendor.businessName} />
      <main className="container py-6">
        <OnboardingClient vendor={vendor} />
        <p className="mt-8 text-center text-xs text-muted-foreground">
          By completing onboarding you agree to our{' '}
          <a
            href="https://feastpot.co.uk/legal/vendor-terms"
            target="_blank"
            rel="noreferrer"
            className="underline hover:no-underline"
          >
            Vendor Terms of Service
          </a>
          .
        </p>
      </main>
    </>
  );
}
