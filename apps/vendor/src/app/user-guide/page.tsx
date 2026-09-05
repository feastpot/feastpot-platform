import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';
import { COMMISSION_RATES } from '@feastpot/config/commission-rates';
import { redirect } from 'next/navigation';

import { PortalShell } from '@/components/layout/portal-shell';
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
    intro:
      'Give kitchen staff, finance, and delivery coordinators access without sharing your owner login.',
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
        detail: `${PLATFORM_FACTS.brandName} charges commission on the food subtotal only - delivery fees are passed through in full and are not commissioned. New kitchens start at ${COMMISSION_RATES.marketplaceFirst.percent}% first-order marketplace commission. Once you have a track record on the platform the rate reduces to ${COMMISSION_RATES.marketplaceRepeat.percent}% repeat-order commission. Your current rate is shown on your Payouts page.`,
      },
      {
        title: 'Weekly payout schedule',
        detail: `We close the books on the previous week at midnight Sunday and create a single Stripe Transfer for your earnings the following ${PLATFORM_FACTS.payouts.day}. Stripe takes 3-5 working days to land funds in your bank.`,
      },
      {
        title: 'Check Payouts for the breakdown',
        detail:
          'Every payout row links to the orders it covers, including refunds and adjustments. Use this view to reconcile your bookkeeping.',
      },
      {
        title: 'Download a payout statement',
        detail:
          'Open any completed payout and use the Download statement button to save a PDF summary. This is useful for your own records and any accountant queries.',
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
    id: 'referral-links',
    title: '7. Referral links',
    intro: 'Grow your customer base by sharing your unique referral link and QR code.',
    steps: [
      {
        title: 'Find your referral link',
        detail: `Open "Bring your own customers" in the Growth section of the sidebar. Your unique ${PLATFORM_FACTS.brandName} referral URL is shown at the top, ready to copy.`,
      },
      {
        title: 'Copy and share the link',
        detail:
          'Click Copy next to your referral URL to put it on your clipboard. Below that you will find ready-to-use text for Instagram and WhatsApp. Click "Copy text" on either card to grab the full message with your link already embedded.',
      },
      {
        title: 'Download your QR code',
        detail:
          'The page generates a QR code for your referral URL. Download a PNG for digital use or an SVG for print-quality output on menus, packaging, and event materials.',
      },
      {
        title: 'Track where your orders come from',
        detail:
          'The order source breakdown at the bottom shows how many orders came from your own marketing versus the Feastpot marketplace. This week and all-time totals update daily.',
      },
      {
        title: 'Commission benefit',
        detail: `Orders placed through your referral link are charged ${COMMISSION_RATES.vendorReferred.percent}% commission. Marketplace orders are charged at your standard rate. Refer enough customers and a significant share of your turnover is commission-free.`,
      },
    ],
  },
  {
    id: 'verification',
    title: '8. Compliance and verification',
    intro:
      'Keep your documents current so your kitchen stays visible in search without interruption.',
    steps: [
      {
        title: 'Check your verification status',
        detail:
          'Open Compliance to see the status of each required document: Food hygiene certificate, Public liability insurance (minimum GBP 5m cover), Photo ID, and Food business registration. Each document shows one of: Not started, Submitted (awaiting review), Approved, Needs changes, Expiring soon, or Expired.',
      },
      {
        title: 'Upload or replace a document',
        detail:
          'Click the upload area under any document. Accepted formats are PDF, JPG, and PNG up to 10 MB. If a document has been rejected, a reviewer note explains what to fix. Re-uploading resets the status to Submitted and triggers a new review. We aim to verify within 1-2 business days.',
      },
      {
        title: 'Renew before expiry',
        detail:
          'Documents entering the 30-day expiry window are flagged as Expiring soon and you will receive an email reminder. Upload the renewed document before the old one expires to avoid any interruption to your listing. Once expired, new orders may be paused until a valid document is verified.',
      },
      {
        title: 'If your account is suspended',
        detail:
          'A red Account suspended banner on the Compliance page means new orders are paused. This is usually triggered by an expired or invalid document. Reply to the compliance email you received or contact vendors@feastpot.co.uk to resolve it. Once a valid document is approved the suspension is lifted without any action needed on your side.',
      },
    ],
  },
  {
    id: 'catering',
    title: '9. Catering enquiries',
    intro:
      'Respond to event enquiries with itemised quotes and track bookings through to completion.',
    steps: [
      {
        title: 'Find your catering enquiries',
        detail:
          'Open the Catering section in the sidebar. The overview shows upcoming events, total bookings, and confirmed revenue. Each card shows the customer, event date, guest count, venue, status, and your total and commission for that booking.',
      },
      {
        title: 'Create a quote',
        detail:
          'Click New catering quote (or use the enquiry link sent by the Feastpot team). Fill in the event date, serving time, guest count, and venue address. Add line items with a description, quantity, and unit price. Quotes must total at least GBP 50. Set your minimum cash deposit; the form charges the greater of 25% or your minimum, capped at the quote total. Set a quote expiry - the default is seven days.',
      },
      {
        title: 'Declare allergens on each line item',
        detail:
          'Toggle the relevant allergens for each menu item in the quote. All 14 statutory allergens are listed. Catering quotes carry the same allergen obligations as your regular menu items.',
      },
      {
        title: 'Send the quote to the customer',
        detail:
          'After saving, open the quote and click Send quote to customer. The customer receives an email with the full breakdown and a link to pay the deposit. You can only send a quote once it is in Quoted status.',
      },
      {
        title: 'Track the booking lifecycle',
        detail:
          'Bookings move through Quoted, Deposit paid, Confirmed, Balance paid, and Completed. The customer pays the deposit and balance through the Feastpot platform. You do not need to chase payment separately. If a booking is cancelled, the card shows the cancellation reason.',
      },
    ],
  },
  {
    id: 'terms-acceptance',
    title: '10. Terms acceptance',
    intro:
      'When Feastpot updates the vendor terms, you must accept the new version before continuing to take orders.',
    steps: [
      {
        title: 'Responding to a terms update',
        detail:
          'A banner on your dashboard tells you when a new version of the vendor terms needs your acceptance. You can continue using the portal but new orders are paused until you accept.',
      },
      {
        title: 'Read and accept',
        detail:
          'Click the banner or open the Terms section from your account menu. The page shows a summary of what has changed. Read it, then click Accept to record your agreement. Acceptance is timestamped and attached to your account.',
      },
      {
        title: 'Notice period',
        detail: `${PLATFORM_FACTS.brandName} gives at least ${PLATFORM_FACTS.termsNoticeDays} days notice before a terms change takes effect. You will receive an email when a new version is published so you are not caught off-guard.`,
      },
      {
        title: 'Viewing your acceptance history',
        detail:
          'The Terms section shows every version you have accepted, with the date and time. This is useful for your own records and for any queries from your accountant or legal adviser.',
      },
    ],
  },
  {
    id: 'tax-information',
    title: '11. Tax information',
    intro:
      'UK law requires Feastpot to collect, verify, and report tax details for all active vendors to HMRC each January.',
    steps: [
      {
        title: 'Why we collect this',
        detail:
          'Under SI 2023/817 (HMRC digital platform reporting regulations), Feastpot must collect your legal name, address, Tax Identification Number (UTR or National Insurance number), and date of birth, and report your annual sales activity to HMRC. Your consent to this was given when you accepted the Feastpot vendor terms.',
      },
      {
        title: 'Complete your tax profile',
        detail:
          'Open Tax information from the sidebar. Fill in your legal name, permanent address, date of birth, and Tax Identification Number. Save when done. An incomplete profile is flagged with a warning badge.',
      },
      {
        title: 'Pre-fill from Stripe',
        detail:
          'If your Stripe Connect account is already verified with legal name and address, click Pre-fill from Stripe to import those details automatically. Review the imported values and save.',
      },
      {
        title: 'Annual HMRC report',
        detail:
          'Each January, Feastpot files a report with HMRC covering your activity in the previous calendar year. You will receive a copy of your individual report by email for your own records.',
      },
      {
        title: 'Keeping your details current',
        detail:
          'If your address or legal name changes during the year, update your tax profile promptly. HMRC requires the details to be accurate at the time of reporting. You can edit your profile at any time from the Tax information page.',
      },
    ],
  },
  {
    id: 'getting-help',
    title: '12. Getting help',
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
    <PortalShell businessName={vendor.businessName}>
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-dark">Vendor user guide</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          A step-by-step walkthrough of the {PLATFORM_FACTS.brandName} vendor portal. For policy
          questions and rules, see the{' '}
          <a href="/help" className="font-medium text-teal-dark underline">
            Help &amp; FAQ
          </a>
          .
        </p>

        <nav aria-label="On this page" className="mb-6 rounded-xl bg-muted/50 p-4">
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
              <h2 className="mb-1 text-lg font-bold text-foreground">{chapter.title}</h2>
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
    </PortalShell>
  );
}
