import { redirect } from 'next/navigation';

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
        {/* Payout cadence panel - addresses the audit finding that vendors
            have no visibility of when they get paid, what the cut-off is,
            or who to contact about a missing transfer. Inline styles per
            the cadence-panel spec keep this self-contained and immune to
            shadcn token drift. Mint background (#E8F5EC) signals
            "informational, not an alert." */}
        <div
          style={{
            background: '#E8F5EC',
            borderRadius: '14px',
            padding: '20px',
            marginBottom: '24px',
          }}
        >
          <h3
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: '#1A1A1A',
              marginBottom: '12px',
            }}
          >
            How Feastpot payouts work
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
              <div key={item.title} style={{ display: 'flex', gap: '12px' }}>
                <span style={{ fontSize: '20px', flexShrink: 0 }} aria-hidden>
                  {item.icon}
                </span>
                <div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#1A1A1A' }}>
                    {item.title}.{' '}
                  </span>
                  <span style={{ fontSize: '13px', color: '#666666' }}>{item.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <PayoutsClient />
      </main>
    </>
  );
}
