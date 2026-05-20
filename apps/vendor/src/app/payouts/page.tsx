import { redirect } from 'next/navigation';

import { RoleGate } from '@/components/auth/role-gate';
import { TopNav } from '@/components/layout/top-nav';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { PayoutsClient } from './payouts-client';

// Reads cookies via Supabase server client → must be dynamic at runtime.
export const dynamic = 'force-dynamic';

interface VendorMe { id: string; businessName: string; status: string }

export default async function PayoutsPage() {
  const supabase = await createServerSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/payouts');

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
  if (vendor.status !== 'live' && vendor.status !== 'probation') redirect('/onboarding');

  return (
    <>
      <TopNav businessName={vendor.businessName} />
      <main className="container py-6">
        <RoleGate path="/payouts">
          {/* Payout cadence panel - informational, not an alert. Uses teal
              brand token so it reads as guidance rather than a money
              callout (brand orange) or a warning (amber). */}
          <div className="mb-6 rounded-xl bg-teal/10 p-5">
            <h3 className="mb-3 text-base font-bold text-foreground">
              How Feastpot payouts work
            </h3>
            <div className="flex flex-col gap-2.5">
              {[
                {
                  icon: '📅',
                  title: 'Weekly every Monday',
                  detail:
                    'Your payout is calculated at midnight on Sunday and transferred Monday morning.',
                },
                {
                  icon: '💷',
                  title: 'You keep 88%',
                  detail:
                    'Feastpot charges 12% commission on the order subtotal. Delivery fees are separate.',
                },
                {
                  icon: '⏱️',
                  title: '3-5 working days to your bank',
                  detail:
                    'Stripe Transfer typically arrives within 3-5 working days of Monday.',
                },
                {
                  icon: '❓',
                  title: 'Query a payout',
                  detail:
                    'Email vendors@feastpot.co.uk with your kitchen name and the week in question.',
                },
              ].map((item) => (
                <div key={item.title} className="flex gap-3">
                  <span className="shrink-0 text-xl" aria-hidden>
                    {item.icon}
                  </span>
                  <div className="text-[13px]">
                    <span className="font-semibold text-foreground">{item.title}. </span>
                    <span className="text-muted-foreground">{item.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <PayoutsClient />
        </RoleGate>
      </main>
    </>
  );
}
