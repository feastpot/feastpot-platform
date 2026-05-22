import { redirect } from 'next/navigation';

import { TopNav } from '@/components/layout/top-nav';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

// Reads cookies via Supabase server client → must be dynamic at runtime.
export const dynamic = 'force-dynamic';

interface VendorMe {
  id: string;
  businessName: string;
  status: string;
}

interface FaqSection {
  id: string;
  title: string;
  body: string[];
}

/**
 * Vendor portal Help & FAQ. Six sections written from the operator-side
 * rules already enforced by the platform (15-minute accept window, 48h
 * dispute SLA, 30-day cert renewal nudge, auto-pause on expiry). The
 * page is intentionally copy-only so we can edit policy here without
 * touching any API behaviour - if a number changes (e.g. commission
 * basis points), update the matching string here AND the corresponding
 * server-side constant.
 */
const SECTIONS: FaqSection[] = [
  {
    id: 'getting-paid',
    title: 'Getting paid',
    body: [
      'Payouts run weekly. Every Sunday at midnight we close the books on the previous week and create a single Stripe Transfer for everything you earned.',
      'Feastpot charges 12% commission on the order subtotal. You keep the remaining 88%. Delivery fees are passed through separately and do not affect your commission.',
      'Your earnings land in the bank account connected to your Stripe Connect profile. Stripe typically takes 3-5 working days to settle the transfer.',
      'Need to query a payout? Email vendors@feastpot.co.uk with your kitchen name and the week in question. Include any order numbers you think are missing.',
    ],
  },
  {
    id: 'managing-orders',
    title: 'Managing orders',
    body: [
      'You have 15 minutes to accept or reject each new order. If you do not respond within 15 minutes, the order is automatically cancelled and the customer is refunded in full.',
      'Persistent non-responsiveness or a high rejection rate may trigger an account review by the Feastpot vendor team.',
      'Once accepted, an order is locked in. Use the order amendment flow if a customer asks to change items - never cancel a confirmed order without contacting support first.',
    ],
  },
  {
    id: 'your-menu',
    title: 'Your menu',
    body: [
      'New menu items start in draft. They only appear to customers once you publish them.',
      'Editing the price of a live item takes effect immediately - any orders already placed at the old price are honoured at that price.',
      'Every item must have an allergen list. UK FSA rules require all 14 statutory allergens to be declared. Items missing allergen data cannot be published.',
      'Use "preparation hours" to control how far in advance the customer must order. A 24-hour prep item will not appear in same-day search results.',
    ],
  },
  {
    id: 'delivery',
    title: 'Delivery',
    body: [
      'Your delivery radius is set on the Settings → Delivery page. Customers outside the radius will not see your kitchen in search.',
      'You can choose local-only, nationwide, or both. Nationwide orders ship in insulated boxes via a courier - we cover the courier cost up to the per-order cap published in your vendor agreement.',
      'To change your service days (e.g. pause weekend orders), update the slot configuration on the same Settings page. Changes take effect on the next available slot, not retroactively.',
    ],
  },
  {
    id: 'compliance',
    title: 'Compliance',
    body: [
      'Your food hygiene certificate and insurance must be renewed annually. Feastpot will email you 30 days before expiry.',
      'If a document expires, the Feastpot compliance team is alerted and may suspend your kitchen from search until an updated document is uploaded and verified. Upload renewals early to avoid any interruption.',
      'You can upload renewed certificates at any time from the Compliance section of your dashboard - we typically verify within 1 working day.',
    ],
  },
  {
    id: 'disputes',
    title: 'Disputes',
    body: [
      'If a customer raises a dispute, you have 24 hours to respond. After 24 hours without a response, the dispute is escalated to Feastpot support and we may issue a full refund to the customer on your behalf. Always respond to disputes promptly.',
      'Disputes must reach a resolved or closed state within 5 working days. Cases still open past that point are reviewed and resolved by Feastpot support.',
      'You can respond through the Disputes tab of the order detail page. Attach photos, delivery proof, or messages with the customer to support your case.',
      'Most disputes are resolved without a refund when there is a clear response and evidence. If you accept partial fault, you can offer a partial refund directly from the response form.',
    ],
  },
];

export default async function HelpPage() {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/help');

  let vendor: VendorMe;
  try {
    vendor = await apiRequest<VendorMe>('/vendors/me', {
      accessToken: session.access_token,
      next: { revalidate: 0 },
    });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404))
      redirect('/unauthorized');
    throw err;
  }
  // Mirror the status gate used on /payouts, /orders, /analytics so a
  // pending/onboarding vendor doesn't see operational help they can't
  // act on yet - they get routed back into the onboarding flow.
  if (vendor.status !== 'live' && vendor.status !== 'probation') redirect('/onboarding');

  return (
    <>
      <TopNav businessName={vendor.businessName} />
      <main className="container max-w-3xl py-6">
        <h1 className="mb-2 text-2xl font-bold text-foreground">Help & FAQ</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Operational rules and policies for Feastpot vendors. Can&rsquo;t find your answer?
          Email{' '}
          <a className="font-medium text-teal-dark underline" href="mailto:vendors@feastpot.co.uk">
            vendors@feastpot.co.uk
          </a>
          .
        </p>

        {/* Sticky table of contents on wide screens - on mobile it
            collapses to a simple anchor list at the top. */}
        <nav aria-label="On this page" className="mb-6 rounded-xl bg-muted/50 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            On this page
          </p>
          <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-teal-dark hover:underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-col gap-6">
          {SECTIONS.map((s) => (
            <section
              key={s.id}
              id={s.id}
              className="scroll-mt-20 rounded-xl border border-border bg-card p-5"
            >
              <h2 className="mb-3 text-lg font-bold text-foreground">{s.title}</h2>
              <div className="flex flex-col gap-3 text-sm leading-relaxed text-foreground/90">
                {s.body.map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
