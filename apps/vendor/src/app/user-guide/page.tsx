import { redirect } from 'next/navigation';

import { SideNav } from '@/components/layout/side-nav';
import { TopNav } from '@/components/layout/top-nav';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface VendorMe {
  id: string;
  businessName: string;
  status: string;
}

interface GuideStep {
  title: string;
  detail: string;
}

interface GuideChapter {
  id: string;
  title: string;
  intro: string;
  steps: GuideStep[];
}

/**
 * Vendor user guide. A task-oriented walkthrough that complements the
 * policy-oriented Help & FAQ at /help. Each chapter is a numbered set
 * of concrete steps a vendor performs in the portal, written in the
 * same voice as the rest of the app. Pure content - no API calls.
 */
const CHAPTERS: GuideChapter[] = [
  {
    id: 'getting-started',
    title: '1. Getting started',
    intro: 'Set up your kitchen before your first order goes live.',
    steps: [
      {
        title: 'Complete your profile',
        detail:
          'Go to Profile and add your business name, cuisine, a short story, and a high-quality cover photo. This is what customers see in search results.',
      },
      {
        title: 'Connect Stripe for payouts',
        detail:
          'Open Payouts and follow the Stripe Connect onboarding link. You will need your business bank details and a form of ID. Without a connected Stripe account you cannot receive money.',
      },
      {
        title: 'Upload compliance documents',
        detail:
          'Open Compliance and upload your food hygiene certificate, public liability insurance, and any local council registrations. Verification typically takes one working day.',
      },
      {
        title: 'Set your service area',
        detail:
          'Open Availability and set your delivery radius, opening hours, and any blackout dates. Customers outside your radius will not see your kitchen.',
      },
    ],
  },
  {
    id: 'building-menu',
    title: '2. Building your menu',
    intro: 'Add the dishes you want to sell, with all the detail customers need to order safely.',
    steps: [
      {
        title: 'Create a menu',
        detail:
          'Open Menu and create a menu. A menu groups items by occasion (Weekday Specials, Family Trays, Eid Boxes). You can have several menus active at once.',
      },
      {
        title: 'Add items with allergens',
        detail:
          'Each item needs a name, price, photo, and the full list of 14 statutory allergens. Items missing allergens cannot be published.',
      },
      {
        title: 'Set preparation time',
        detail:
          'Use the preparation-hours field to control how far in advance customers must order. A 24-hour tray will not appear in same-day search results.',
      },
      {
        title: 'Publish',
        detail:
          'New items start in draft. Switch each item to published when you are ready for customers to see it. You can unpublish at any time.',
      },
    ],
  },
  {
    id: 'daily-operations',
    title: '3. Daily operations',
    intro: 'How the kitchen-side flow works once orders start coming in.',
    steps: [
      {
        title: 'Accept new orders within 15 minutes',
        detail:
          'The Dashboard plays a sound when a new order arrives. You have 15 minutes to accept or reject. After that the order is auto-cancelled and the customer is refunded in full.',
      },
      {
        title: 'Move orders through the stages',
        detail:
          'On the Orders page, mark each order Preparing when you start cooking, Dispatched when it leaves the kitchen, and Delivered when the customer has it. The customer is notified at each step.',
      },
      {
        title: 'Capture payment on delivery',
        detail:
          'Payment is authorised when the customer places the order but only captured when you mark it Delivered. If you reject before delivery, the customer is never charged.',
      },
      {
        title: 'Use amendments instead of cancelling',
        detail:
          'If a customer asks for a change after you have accepted, use the order amendment flow rather than cancelling. Cancelling a confirmed order without contacting support can affect your standing.',
      },
    ],
  },
  {
    id: 'managing-team',
    title: '4. Managing your team',
    intro: 'Give kitchen staff, finance, and delivery coordinators access without sharing your owner login.',
    steps: [
      {
        title: 'Invite a team member',
        detail:
          'Open Team and send an invite by email. They will receive a link to set their password and join your kitchen.',
      },
      {
        title: 'Pick the right role',
        detail:
          'Kitchen Manager can manage menu and orders. Finance can see payouts and analytics. Staff can only handle orders. Delivery Coordinator handles orders and availability. Owner can do everything.',
      },
      {
        title: 'Remove access when someone leaves',
        detail:
          'Revoke access from the Team page the same day someone stops working with you. Their session is invalidated immediately.',
      },
    ],
  },
  {
    id: 'money-payouts',
    title: '5. Money and payouts',
    intro: 'How earnings are calculated and when they land in your account.',
    steps: [
      {
        title: 'Understand your share',
        detail:
          'Feastpot keeps 12% commission on the order subtotal. You keep the remaining 88%. Delivery fees are passed through separately and are not commissioned.',
      },
      {
        title: 'Weekly payout schedule',
        detail:
          'We close the previous week at midnight every Sunday and create a single Stripe Transfer for your earnings. Stripe takes 3-5 working days to land funds in your bank.',
      },
      {
        title: 'Check Payouts for the breakdown',
        detail:
          'Every payout row links to the orders it covers, including refunds and adjustments. Use this view to reconcile your bookkeeping.',
      },
    ],
  },
  {
    id: 'security',
    title: '6. Keeping the account secure',
    intro: 'Protect your kitchen account and your customers.',
    steps: [
      {
        title: 'Turn on two-factor authentication',
        detail:
          'Open Security and enable 2FA with an authenticator app. Print your recovery codes and store them somewhere safe.',
      },
      {
        title: 'Use a strong, unique password',
        detail:
          'Do not reuse your email password. A password manager is the easiest way to keep a long random password per service.',
      },
      {
        title: 'Sign out of devices you do not recognise',
        detail:
          'The Security page lists your active sessions. Sign out of anything unfamiliar and change your password.',
      },
    ],
  },
  {
    id: 'getting-help',
    title: '7. Getting help',
    intro: 'Where to look when something goes wrong.',
    steps: [
      {
        title: 'Read the FAQ first',
        detail:
          'The Help page covers the most common policy questions: payouts, disputes, compliance, accept windows, delivery rules.',
      },
      {
        title: 'Email vendor support',
        detail:
          'For account-specific issues email vendors@feastpot.co.uk with your kitchen name and any relevant order numbers. We aim to respond within one working day.',
      },
      {
        title: 'Urgent live-order problems',
        detail:
          'If an order is in progress and something has gone wrong, use the order detail page to flag for support. These tickets are prioritised over general queries.',
      },
    ],
  },
];

export default async function UserGuidePage() {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/user-guide');

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
  if (vendor.status === 'pending' || vendor.status === 'removed') redirect('/onboarding');

  return (
    <>
      <div className="md:hidden">
        <TopNav businessName={vendor.businessName} />
      </div>
      <div className="flex min-h-screen bg-surface">
        <SideNav businessName={vendor.businessName} />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-6">
          <div className="mx-auto max-w-3xl">
            <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-dark">
              Vendor user guide
            </h1>
            <p className="mb-6 text-sm text-muted-foreground">
              A step-by-step walkthrough of the Feastpot vendor portal. For policy
              questions and rules, see the{' '}
              <a href="/help" className="font-medium text-teal-dark underline">
                Help &amp; FAQ
              </a>
              .
            </p>

            <nav
              aria-label="On this page"
              className="mb-6 rounded-xl bg-muted/50 p-4"
            >
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                On this page
              </p>
              <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                {CHAPTERS.map((c) => (
                  <li key={c.id}>
                    <a href={`#${c.id}`} className="text-teal-dark hover:underline">
                      {c.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="flex flex-col gap-6">
              {CHAPTERS.map((chapter) => (
                <section
                  key={chapter.id}
                  id={chapter.id}
                  className="scroll-mt-20 rounded-xl border border-border bg-card p-5"
                >
                  <h2 className="mb-1 text-lg font-bold text-foreground">
                    {chapter.title}
                  </h2>
                  <p className="mb-4 text-sm text-muted-foreground">{chapter.intro}</p>
                  <ol className="flex flex-col gap-3 text-sm leading-relaxed text-foreground/90">
                    {chapter.steps.map((step, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-light text-xs font-bold text-teal-dark">
                          {i + 1}
                        </span>
                        <div>
                          <p className="font-semibold text-foreground">{step.title}</p>
                          <p className="mt-0.5 text-foreground/80">{step.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
