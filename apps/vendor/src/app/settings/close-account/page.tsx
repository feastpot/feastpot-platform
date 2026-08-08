import { redirect } from 'next/navigation';

import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';

import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Close your account | Feastpot Vendor' };

interface VendorSummary {
  id: string;
  businessName: string;
  status: string;
}

interface OrderSummary {
  id: string;
  status: string;
  scheduledFor: string | null;
  totalPricePence: number;
}

interface PayoutSummary {
  nextPayoutDate: string | null;
  pendingPence: number;
}

async function fetchWithToken<T>(path: string, token: string): Promise<T | null> {
  try {
    return await apiRequest<T>(path, { accessToken: token });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export default async function CloseAccountPage() {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/settings/close-account');

  const token = session.access_token;

  let vendor: VendorSummary | null = null;
  try {
    vendor = await apiRequest<VendorSummary>('/vendors/me', { accessToken: token });
  } catch {
    redirect('/unauthorized');
  }

  const [openOrders, payoutInfo] = await Promise.all([
    fetchWithToken<OrderSummary[]>('/vendors/me/orders?status=pending,accepted,preparing', token),
    fetchWithToken<PayoutSummary>('/vendors/me/payouts/summary', token),
  ]);

  const pendingOrderCount = openOrders?.length ?? 0;
  const pendingPayoutPounds = payoutInfo ? payoutInfo.pendingPence / 100 : null;
  const nextPayoutDate = payoutInfo?.nextPayoutDate
    ? new Date(payoutInfo.nextPayoutDate).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <main className="min-h-screen bg-surface p-6">
      <div className="mx-auto max-w-2xl space-y-8">

        <header>
          <h1 className="text-2xl font-bold text-dark">Close your account</h1>
          <p className="mt-1 text-sm text-mid">
            We&rsquo;re sorry to see you go. This page explains exactly what happens to
            your outstanding orders, bookings, and pending earnings before your account
            closes.
          </p>
        </header>

        {/* Outstanding obligations */}
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-3">
          <h2 className="font-semibold text-amber-900">What happens to open orders</h2>
          {pendingOrderCount > 0 ? (
            <>
              <p className="text-sm text-amber-800">
                You have <strong>{pendingOrderCount}</strong> open{' '}
                {pendingOrderCount === 1 ? 'order' : 'orders'} that must be fulfilled
                before your account can close. Feastpot will not cancel customer orders
                on your behalf; customers have already paid and are expecting delivery.
              </p>
              <p className="text-sm text-amber-800">
                Once all open orders are complete (delivered or cancelled by the customer),
                email{' '}
                <a
                  href={`mailto:${PLATFORM_FACTS.contact.complianceEmail}?subject=Vendor%20account%20closure%20request`}
                  className="font-semibold underline underline-offset-2 hover:text-amber-700"
                >
                  {PLATFORM_FACTS.contact.complianceEmail}
                </a>{' '}
                with the subject line <em>&quot;Vendor account closure request&quot;</em> to
                begin the process.
              </p>
            </>
          ) : (
            <p className="text-sm text-amber-800">
              You have no open orders, so your account can be closed once you have confirmed
              your final payout.
            </p>
          )}
        </section>

        {/* Pending earnings */}
        <section className="rounded-xl border p-5 space-y-3">
          <h2 className="font-semibold text-dark">Pending earnings</h2>
          {pendingPayoutPounds !== null ? (
            <p className="text-sm text-mid">
              You have{' '}
              <strong>
                £{pendingPayoutPounds.toFixed(2)}
              </strong>{' '}
              in pending earnings.{' '}
              {nextPayoutDate
                ? `Your next payout is scheduled for ${nextPayoutDate}.`
                : 'Your final payout will be processed on the next Monday after your account closes.'}
            </p>
          ) : (
            <p className="text-sm text-mid">
              Your final payout will be processed on the next Monday after your account
              closes. Payouts take 2–5 business days to arrive.
            </p>
          )}
          <p className="text-sm text-mid">
            Feastpot will not withhold earnings owed to you. If there are outstanding
            chargebacks when your account closes, the amounts will be deducted from the
            final payout in line with the Vendor Terms.
          </p>
        </section>

        {/* Termination right under P2B */}
        <section className="rounded-xl border p-5 space-y-3">
          <h2 className="font-semibold text-dark">Your termination right (P2B Regulation)</h2>
          <p className="text-sm text-mid">
            Under the UK P2B Regulation, you may terminate your vendor agreement without
            penalty at any time before new terms take effect. Feastpot will not charge you
            for early termination.
          </p>
          <p className="text-sm text-mid">
            Your listing will be deactivated, and you will no longer appear in search
            results from the date your closure is confirmed.
          </p>
        </section>

        {/* CTA */}
        <section className="rounded-xl border border-red-100 bg-red-50 p-5 space-y-3">
          <h2 className="font-semibold text-red-900">Ready to proceed?</h2>
          <p className="text-sm text-red-800">
            Email{' '}
            <a
              href={`mailto:${PLATFORM_FACTS.contact.complianceEmail}?subject=Vendor%20account%20closure%20request%20–%20${encodeURIComponent(vendor?.businessName ?? '')}`}
              className="font-semibold underline underline-offset-2 hover:text-red-700"
            >
              {PLATFORM_FACTS.contact.complianceEmail}
            </a>{' '}
            with the subject line{' '}
            <em>
              &quot;Vendor account closure request &ndash;{' '}
              {vendor?.businessName ?? 'your business name'}&quot;
            </em>
            . Our team will confirm the closure date, final payout schedule, and data
            retention timeline within 2 business days.
          </p>
          <p className="text-xs text-red-700">
            Closing your account does not delete your data immediately. Feastpot retains
            transaction records for 7 years in line with HMRC requirements. You may request
            deletion of personal data that is not subject to a legal hold by emailing
            privacy@feastpot.co.uk after your account is closed.
          </p>
        </section>

        <p className="text-xs text-mid text-center">
          Changed your mind?{' '}
          <a href="/dashboard" className="underline hover:text-dark">
            Return to your dashboard
          </a>
          {' '}or{' '}
          <a href="/onboarding/terms" className="underline hover:text-dark">
            accept the updated terms
          </a>
          .
        </p>

      </div>
    </main>
  );
}
