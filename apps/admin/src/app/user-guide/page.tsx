import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';

import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

export const dynamic = 'force-dynamic';

interface GuideSection {
  id: string;
  title: string;
  roleNote?: string;
  items: { heading: string; detail: string }[];
}

/**
 * Admin portal user guide. Covers every section of the admin panel with
 * role-based access notes so staff know which parts of the UI are available
 * to them. All four roles can reach this page.
 */
const SECTIONS: GuideSection[] = [
  {
    id: 'roles',
    title: 'Roles and access',
    items: [
      {
        heading: 'Admin',
        detail:
          'Full access to every section including job queues, push notifications, settings, menu moderation, review moderation, and commission rate configuration. Use this role for senior engineering and ops staff only.',
      },
      {
        heading: 'Support',
        detail:
          'Can view orders, users, vendors, applications, disputes, events, catering enquiries, coverage waitlist, and attribution. Cannot access financial tools (payouts, chargebacks, FeastPass health, commission rates) or admin-only moderation tools.',
      },
      {
        heading: 'Finance',
        detail:
          'Can view orders, users, payouts, chargebacks, discount codes, FeastPass health, commission rates, catering bookings, and attribution. Does not have access to compliance, disputes, or vendor applications.',
      },
      {
        heading: 'Compliance',
        detail:
          'Can view users, vendors, vendor applications, and the compliance dashboard. Has access to the audit log. Does not have access to financial tools or order management.',
      },
    ],
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    roleNote: 'All roles',
    items: [
      {
        heading: 'Operational overview',
        detail:
          'The dashboard shows headline metrics: orders placed, GMV, active vendors, and open disputes. Use this as your morning check-in to spot anything that needs immediate attention.',
      },
      {
        heading: 'Search trends',
        detail:
          'The lower panel surfaces recent search queries customers are making on the platform. Use this to identify demand for cuisines or areas where coverage is thin.',
      },
    ],
  },
  {
    id: 'orders',
    title: 'Orders',
    roleNote: 'Admin, Support, Finance',
    items: [
      {
        heading: 'Browse and search orders',
        detail:
          'The Orders list supports filtering by status, date range, vendor, and customer. Use the search bar to look up a specific order by ID or customer email.',
      },
      {
        heading: 'Order detail',
        detail:
          'Each order shows the full line items, vendor, customer, delivery details, payment status, and timeline of status changes. You can see whether a customer is a FeastPass member and whether the service fee was waived.',
      },
      {
        heading: 'Dispute and amendment history',
        detail:
          'The order detail page links directly to any open dispute or amendment proposal on that order. Use this to get full context before responding to a customer or vendor query.',
      },
    ],
  },
  {
    id: 'vendors',
    title: 'Vendors and applications',
    roleNote: 'Admin, Support, Compliance',
    items: [
      {
        heading: 'Vendor directory',
        detail:
          'The Vendors list shows all registered kitchens with their current status (live, probation, suspended, removed). Click any row to open the vendor detail page.',
      },
      {
        heading: 'Vendor detail',
        detail:
          'Shows the vendor profile, live status, compliance document signals, and verification record. Compliance and admin staff can action verification state changes from this page.',
      },
      {
        heading: 'Vendor applications queue',
        detail:
          'New vendor applications land here. Each application shows the submitted business details and uploaded documents. Compliance staff review and either approve (moving the vendor to live status) or reject with a reason. Use Resend email to re-trigger the outcome notification if the vendor reports not receiving it.',
      },
      {
        heading: 'Hygiene number visibility',
        detail:
          'The applications list flags any application where a Food Standards Agency registration number is missing. This lets compliance staff prioritise those for follow-up before final approval.',
      },
    ],
  },
  {
    id: 'compliance',
    title: 'Compliance',
    roleNote: 'Admin, Compliance',
    items: [
      {
        heading: 'Verification triage list',
        detail:
          'The Compliance page lists every vendor verification record with its current state: verified, renewal_due, suspended, or revoked. Use the filter chips at the top to focus on a specific state without scrolling the whole list.',
      },
      {
        heading: 'Renewal due',
        detail:
          'Vendors whose verification is approaching expiry appear in the renewal_due state. The compliance team should contact these vendors proactively and review any uploaded renewal documents promptly to avoid gaps in their listing.',
      },
      {
        heading: 'Suspended vendors',
        detail:
          'A suspended vendor has had their listing paused, usually because a required document has expired or been rejected. Once the vendor uploads a valid replacement and it is approved, the suspension can be lifted from the vendor detail page.',
      },
      {
        heading: 'Audit log',
        detail:
          'Every compliance action (state changes, document approvals, rejections) is recorded in the Audit log with the acting staff member and timestamp. Use this to investigate any disputed decision.',
      },
    ],
  },
  {
    id: 'disputes',
    title: 'Disputes',
    roleNote: 'Admin, Support',
    items: [
      {
        heading: 'Dispute queue',
        detail:
          'The Disputes list shows all open and recently closed disputes, sortable by age and status. Disputes without a vendor response for more than 24 hours are highlighted - these may need escalation.',
      },
      {
        heading: 'Dispute detail',
        detail:
          'Each dispute shows the full message thread between customer and vendor, any evidence attachments, and the current status. Support staff can escalate, resolve, or issue a refund from this page.',
      },
      {
        heading: 'SLA tracking',
        detail:
          'Disputes must reach a resolved or closed state within 5 working days. Cases still open past that point are flagged for staff review. Check the dispute detail page for the creation date to assess urgency.',
      },
    ],
  },
  {
    id: 'catering',
    title: 'Catering enquiries and bookings',
    roleNote: 'Admin, Support (enquiries); Admin, Finance, Support (bookings)',
    items: [
      {
        heading: 'Catering enquiries inbox',
        detail:
          'Catering Enquiries lists incoming event requests from customers. Each enquiry shows the event date, guest count, cuisine preferences, budget, and venue. The support team routes accepted enquiries to appropriate vendors by sharing the enquiry link.',
      },
      {
        heading: 'Catering bookings',
        detail:
          'Catering Bookings shows all quotes created by vendors in response to enquiries. Filter by status to see which bookings are awaiting deposit, confirmed, or completed. Finance can use this view to cross-check catering commission revenue.',
      },
      {
        heading: 'Events',
        detail:
          'The Events section shows broader event-related enquiries that may span multiple vendors or require bespoke handling. Use this alongside Catering Enquiries for larger or more complex event requests.',
      },
    ],
  },
  {
    id: 'finance',
    title: 'Finance',
    roleNote: 'Admin, Finance',
    items: [
      {
        heading: 'Payouts',
        detail:
          'The Payouts section lists every weekly Stripe Transfer grouped by vendor. Each row shows the gross amount, commission retained, and net paid out. You can drill into the constituent orders and see whether any refunds or adjustments were applied.',
      },
      {
        heading: 'Chargebacks',
        detail:
          'Open chargebacks appear in the Chargebacks queue with their current Stripe dispute status. When a chargeback is lost, the reconciliation is applied automatically (refund + credit ledger entries). Monitor this list for any disputes stuck in evidence-gathering that need a Stripe response before the deadline.',
      },
      {
        heading: 'Discount codes',
        detail:
          'Create, edit, and deactivate promotional codes from the Discount codes section. Each code has a type (percentage or fixed amount), a redemption limit, and an optional expiry date.',
      },
      {
        heading: 'Commission rates',
        detail: `Commission rates are configured per vendor tier. The default rates (${PLATFORM_FACTS.commission.marketplaceFirst}% first-order marketplace commission, ${PLATFORM_FACTS.commission.marketplaceRepeat}% repeat-order commission) apply unless a vendor has a negotiated rate row. Add a new rate row here when agreeing a custom arrangement with a vendor.`,
      },
      {
        heading: 'FeastPass health',
        detail:
          'The FeastPass health page shows active subscriber counts, monthly and annual plan splits, and recent webhook events from Stripe. Check this after any Stripe pricing change or webhook incident to confirm subscriptions are processing correctly.',
      },
    ],
  },
  {
    id: 'content-moderation',
    title: 'Content moderation',
    roleNote: 'Admin only',
    items: [
      {
        heading: 'Menu queue',
        detail:
          'New menu items submitted by vendors appear here for review before they go live on the customer site. Check for accurate allergen declarations, appropriate photos, and correct pricing. Approve or reject with a note.',
      },
      {
        heading: 'Review queue',
        detail:
          'Customer reviews flagged by vendors or automated filters appear here. Approve to publish or remove with a reason. All moderation decisions are logged.',
      },
      {
        heading: 'Push notifications',
        detail:
          'Compose and send broadcast push notifications to all app users or a targeted segment. Always preview the message before sending - there is no recall once a notification is dispatched.',
      },
      {
        heading: 'Dead-letter notifications',
        detail:
          'The Notifications page lists outbox entries that failed to deliver after all retries. Each row shows the channel (email or WhatsApp), recipient, template, and failure reason. Use this to identify systemic delivery failures rather than individual bounces.',
      },
    ],
  },
  {
    id: 'attribution',
    title: 'Attribution and analytics',
    roleNote: 'Admin, Finance, Support',
    items: [
      {
        heading: 'Referral attribution',
        detail:
          'The Attribution page shows order and revenue attribution by referral link and campaign. Use this to evaluate the performance of affiliate or influencer partnerships.',
      },
      {
        heading: 'Export',
        detail:
          'Attribution data can be exported as CSV for use in external reporting tools. Select the date range and click Export before downloading.',
      },
    ],
  },
  {
    id: 'coverage',
    title: 'Coverage and waitlist',
    roleNote: 'Admin, Support',
    items: [
      {
        heading: 'Coverage waitlist',
        detail:
          'Customers who request coverage in areas where Feastpot is not yet live are listed here. Use this data to prioritise vendor recruitment in high-demand postcodes.',
      },
      {
        heading: 'Vendor recommendations',
        detail:
          'Curate the recommended vendor slots shown to customers in areas where organic search results are thin. Changes here take effect immediately.',
      },
    ],
  },
  {
    id: 'job-queues',
    title: 'Job queues (Bull Board)',
    roleNote: 'Admin only',
    items: [
      {
        heading: 'Accessing Bull Board',
        detail:
          'Click Job queues in the sidebar to open Bull Board in a new tab. You will be prompted for the Bull Board password (stored in secrets). This view is separate from the admin panel and runs against the live Redis queue.',
      },
      {
        heading: 'Dead-letter queue (DLQ)',
        detail:
          'Jobs that have exhausted all retry attempts land in the failed state. Review the stack trace on each failed job to diagnose the root cause. You can retry a failed job individually or in bulk once the underlying issue is resolved.',
      },
      {
        heading: 'Monitoring queue depth',
        detail:
          'If any queue shows a large and growing backlog of waiting jobs, the worker may have stalled or a dependency (Stripe, Twilio, Redis) may be degraded. Check the API workflow logs and the Slack #alerts channel before retrying jobs in bulk.',
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings and security',
    roleNote: 'Admin only (settings page); all roles (own account)',
    items: [
      {
        heading: 'Enable two-factor authentication',
        detail:
          'Open Settings and enable 2FA with an authenticator app. All admin staff should have 2FA active - it is required before access to sensitive financial and moderation tools is granted.',
      },
      {
        heading: 'Active sessions',
        detail:
          'The Settings page lists your active sessions. Sign out of any device you do not recognise and change your password immediately if you suspect unauthorised access.',
      },
      {
        heading: 'Inviting new staff',
        detail:
          'New admin users are provisioned by an existing admin via the Users section. Assign the minimum role the person needs to do their job - do not default to admin.',
      },
    ],
  },
];

export default async function AdminUserGuidePage() {
  // All four staff roles can read the guide.
  const user = await requireStaff('/user-guide', ['admin', 'support', 'finance', 'compliance']);

  return (
    <StaffShell user={user}>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-2 text-2xl font-extrabold tracking-tight">Admin user guide</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          A section-by-section reference for the Feastpot admin panel. Role access notes are shown
          for each section so you know what is available to you.
        </p>

        <nav aria-label="On this page" className="mb-6 rounded-xl bg-muted/50 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            On this page
          </p>
          <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-primary hover:underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-col gap-6">
          {SECTIONS.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="scroll-mt-20 rounded-xl border border-border bg-card p-5"
            >
              <div className="mb-3 flex flex-wrap items-baseline gap-3">
                <h2 className="text-lg font-bold text-foreground">{section.title}</h2>
                {section.roleNote && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {section.roleNote}
                  </span>
                )}
              </div>
              <dl className="flex flex-col gap-4 text-sm leading-relaxed">
                {section.items.map((item, i) => (
                  <div key={i}>
                    <dt className="font-semibold text-foreground">{item.heading}</dt>
                    <dd className="mt-0.5 text-foreground/80">{item.detail}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </StaffShell>
  );
}
