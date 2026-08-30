/**
 * Notification template registry.
 *
 * Each event maps to:
 *   - subject (for email/push title)
 *   - render(data) → html (used by email; also used as `body` for push fallback)
 *   - sms?(data)  → plain text (used when channels includes 'sms'; falls back to subject)
 *   - channels: which delivery channels to attempt for this event
 *   - whatsappTemplate?: pre-approved Meta template name (when channels includes whatsapp)
 *
 * Adding a new event: register here so the processor can route it. Unknown
 * events are logged and dropped - we never silently invent body text.
 *
 * Brand styling: all email bodies use the helpers in `./base-layout.ts` to
 * keep visual identity consistent across transactional emails (Feastpot
 * orange header, Inter typography, table-based layout for client portability).
 *
 * SECURITY: user-controlled fields (vendorName, customerName, vendorResponse,
 * resolutionNote, holdReason, etc.) MUST be wrapped with `esc()` before
 * being interpolated into HTML body contexts. The helpers `p`, `amberCallout`,
 * and raw `<blockquote>…</blockquote>` strings DO NOT escape their input
 * (they accept HTML by contract so callers can embed `<strong>`). The helpers
 * `h2`, `keyValueRow`, `itemsTable`, `brandButton`, `tealPill`, and
 * baseLayout's `title` argument already escape internally.
 */

import {
  amberCallout,
  baseLayout,
  brandButton,
  escapeHtml,
  formatMoney,
  h2,
  itemsTable,
  keyValueRow,
  p,
  tealPill,
} from './base-layout';

export type Channel = 'email' | 'whatsapp' | 'sms' | 'push';

export interface NotificationTemplate {
  subject: (data: Record<string, unknown>) => string;
  render: (data: Record<string, unknown>) => string;
  /** Optional plain-text SMS body. If omitted, processor falls back to subject. */
  sms?: (data: Record<string, unknown>) => string;
  channels: Channel[];
  whatsappTemplate?: string;
}

/** Plain string coercion - UNESCAPED. Use for subjects, SMS bodies, and URL components. */
const str = (v: unknown, fallback = ''): string =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : fallback;

/**
 * Escaped string coercion - USE WHENEVER interpolating user-controlled
 * data inside an HTML body (p / amberCallout / raw <…> strings).
 */
const esc = (v: unknown, fallback = ''): string => escapeHtml(str(v, fallback));

const trackingUrl = (orderId: unknown): string =>
  `https://feastpot.co.uk/orders/${str(orderId, 'unknown')}/tracking`;

const reviewUrl = (orderId: unknown): string =>
  `https://feastpot.co.uk/orders/${str(orderId, 'unknown')}/review`;

export const TEMPLATES: Record<string, NotificationTemplate> = {
  menu_allergen_action_required: {
    subject: (d) =>
      `${str(d.affectedCount, 'Some')} of your dishes need allergen confirmation`,
    render: (d) =>
      baseLayout(
        'Allergen confirmation required',
        h2('Please confirm your dishes') +
          amberCallout(
            `${esc(d.affectedCount, 'Some')} dish${Number(d.affectedCount) === 1 ? '' : 'es'} from ${esc(d.vendorName, 'your kitchen')} are temporarily hidden until their allergen information is confirmed.`,
          ) +
          p(
            'This is a food-safety requirement, not a penalty. We have not deleted your dishes or guessed what they contain.',
          ) +
          p(
            'Open each affected dish, select every allergen it contains or confirm that it is free from all 14 regulated allergens, then publish it again.',
          ) +
          brandButton(
            'Review affected dishes',
            'https://vendor.feastpot.co.uk/menu',
            'vendorBlue',
          ),
      ),
    channels: ['email', 'whatsapp'],
    whatsappTemplate: 'menu_allergen_action_required',
  },
  // ---------- Events ----------
  event_enquiry_matched: {
    subject: (d) => `New event enquiry: ${str(d.eventType, 'event')} for ${str(d.guestCount, '?')}`,
    render: (d) =>
      baseLayout(
        'New event enquiry',
        h2('New event enquiry') +
          p(
            `You've been matched to a new event: <strong>${esc(d.eventType, 'event')}</strong> for ${esc(d.guestCount, '?')} guests on ${esc(d.eventDate)} (${esc(d.postcode)}).`,
          ) +
          p('Submit your quote in the vendor portal within 24 hours.') +
          brandButton('Open vendor portal', 'https://vendor.feastpot.co.uk/events', 'vendorBlue'),
      ),
    channels: ['email', 'push'],
  },
  event_quote_received: {
    subject: () => 'New quote received for your event',
    render: (d) =>
      baseLayout(
        'A vendor responded',
        h2('A vendor responded') +
          p(
            `A vendor has submitted a quote for <strong>${formatMoney(d.totalPence)}</strong>. Review and choose in the app.`,
          ) +
          brandButton('Review quote', 'https://feastpot.co.uk/account/events'),
      ),
    channels: ['email', 'whatsapp', 'push'],
    whatsappTemplate: 'event_quote_received',
  },
  event_reminder_72h: {
    subject: () => 'Confirm your event guest count',
    render: (d) =>
      baseLayout(
        'Event in 72 hours',
        h2('Event in 72 hours') +
          p(
            `Your event is on ${esc(d.eventDate)}. Please confirm your final guest count (currently ${esc(d.guestCount, '?')}).`,
          ) +
          brandButton('Confirm guest count', 'https://feastpot.co.uk/account/events'),
      ),
    channels: ['email', 'whatsapp', 'push'],
    whatsappTemplate: 'event_reminder_72h',
  },
  event_balance_link: {
    subject: () => 'Event balance payment due',
    render: (d) =>
      baseLayout(
        'Balance payment',
        h2('Balance payment due') +
          p(`Your event balance of <strong>${formatMoney(d.balancePence)}</strong> is now due.`) +
          brandButton('Pay balance', 'https://feastpot.co.uk/account/events'),
      ),
    channels: ['email', 'whatsapp', 'push'],
    whatsappTemplate: 'event_balance_link',
  },

  // ---------- Orders ----------
  order_confirmation: {
    subject: (d) => `Order confirmed with ${str(d.vendorName, 'your vendor')} 🍽️`,
    render: (d) => {
      const items = Array.isArray(d.items)
        ? (d.items as Array<{ name: string; qty: number; pricePence: number }>)
        : [];
      const orderNumber = str(d.orderNumber);
      return baseLayout(
        'Order confirmed',
        h2(`Thanks${d.customerName ? ', ' + str(d.customerName) : ''} - your order is confirmed!`) +
          p(
            `<strong>${esc(d.vendorName, 'Your vendor')}</strong> has received order <strong>${esc(orderNumber)}</strong> and will accept it shortly.`,
          ) +
          (items.length ? itemsTable(items) : '') +
          keyValueRow('Total', formatMoney(d.totalPence), { bold: true }) +
          (d.scheduledFor ? keyValueRow('Scheduled for', str(d.scheduledFor)) : '') +
          brandButton('Track your order', trackingUrl(d.orderId)),
        `Order ${orderNumber} confirmed - total ${formatMoney(d.totalPence)}`,
      );
    },
    sms: (d) =>
      `Feastpot: Order confirmed with ${str(d.vendorName, 'your vendor')}! Ref: ${str(d.orderNumber)}. Track: ${trackingUrl(d.orderId)}`,
    channels: ['email', 'sms', 'whatsapp', 'push'],
    whatsappTemplate: 'order_confirmation',
  },
  order_accepted: {
    subject: (d) => `${str(d.vendorName, 'Your vendor')} has accepted your order! 👨‍🍳`,
    render: (d) =>
      baseLayout(
        'Vendor accepted your order',
        h2(`${str(d.vendorName, 'Your vendor')} is preparing your order`) +
          p(`Order <strong>${esc(d.orderNumber)}</strong> is now in the kitchen.`) +
          (d.scheduledFor ? p(`Scheduled for: <strong>${esc(d.scheduledFor)}</strong>`) : '') +
          brandButton('Track your order', trackingUrl(d.orderId), 'teal'),
      ),
    sms: (d) =>
      `Feastpot: ${str(d.vendorName, 'Your vendor')} is preparing order ${str(d.orderNumber)} now. Track: ${trackingUrl(d.orderId)}`,
    channels: ['email', 'sms', 'whatsapp', 'push'],
    whatsappTemplate: 'order_accepted',
  },
  order_dispatched: {
    subject: () => `Your order is on the way 🚗`,
    render: (d) =>
      baseLayout(
        'Out for delivery',
        h2('Your order is on the way') +
          p(
            `Order <strong>${esc(d.orderNumber)}</strong> from ${esc(d.vendorName, 'your vendor')} just left the kitchen.`,
          ) +
          (d.etaText ? keyValueRow('ETA', str(d.etaText), { bold: true }) : '') +
          brandButton('Track your order', trackingUrl(d.orderId), 'teal') +
          p('Need to reach the vendor? Use the contact button on the tracking page.', '#888780'),
      ),
    sms: (d) =>
      `Feastpot: Your order from ${str(d.vendorName, 'your vendor')} is on the way! ETA: ${str(d.etaText, 'soon')}. Track: ${trackingUrl(d.orderId)}`,
    channels: ['email', 'sms', 'whatsapp', 'push'],
    whatsappTemplate: 'order_dispatched',
  },
  delivery_confirmed: {
    subject: () => `Order delivered - leave a review ⭐`,
    render: (d) => {
      const points =
        typeof d.loyaltyPointsEarned === 'number' ? (d.loyaltyPointsEarned as number) : 0;
      return baseLayout(
        'Delivered',
        h2('Enjoy!') +
          p(
            `We hope order <strong>${esc(d.orderNumber, 'your order')}</strong> from ${esc(d.vendorName, 'your vendor')} hit the spot.`,
          ) +
          (points > 0
            ? `<div style="margin:14px 0">${tealPill(`+${points} loyalty points earned`)}</div>`
            : '') +
          brandButton('Leave a review', reviewUrl(d.orderId), 'teal'),
      );
    },
    channels: ['email', 'whatsapp', 'push'],
    whatsappTemplate: 'delivery_confirmed',
  },
  // Customer self-cancellation confirmation. NB: this codebase uses Stripe
  // MANUAL CAPTURE and cancels the PaymentIntent on customer-cancel, so the
  // customer was never charged - we tell them the authorisation is released,
  // NOT that a refund was issued (a refund email here would be inaccurate).
  order_cancelled_by_customer: {
    subject: (d) => `Your order from ${str(d.vendorName, 'your vendor')} has been cancelled`,
    render: (d) =>
      baseLayout(
        'Order cancelled',
        h2(`Hi${d.customerFirstName ? ' ' + str(d.customerFirstName) : ''},`) +
          p(
            `Your order <strong>${esc(d.orderNumber)}</strong> from <strong>${esc(d.vendorName, 'your vendor')}</strong> has been cancelled.`,
          ) +
          p(
            `You have not been charged. The payment authorisation of <strong>${formatMoney(d.totalPence)}</strong> has been released and any pending hold will drop off your statement within a few working days.`,
          ) +
          p(
            `If you didn't cancel this order or have any questions, contact us at <a href="mailto:support@feastpot.co.uk" style="color:#1D9E75">support@feastpot.co.uk</a>.`,
          ) +
          brandButton('View order history', 'https://feastpot.co.uk/account/orders', 'teal'),
        `Order ${str(d.orderNumber)} cancelled: you have not been charged`,
      ),
    channels: ['email', 'push'],
  },
  // Vendor alert when a customer cancels a still-cancellable (pending/accepted)
  // order, so the kitchen knows not to prep it.
  order_cancelled_vendor_alert: {
    subject: (d) => `Order ${str(d.orderNumber)} was cancelled by the customer`,
    render: (d) =>
      baseLayout(
        'Order cancelled',
        h2('A customer cancelled their order') +
          p(
            `Order <strong>${esc(d.orderNumber)}</strong> has been cancelled by the customer, so there's no need to prepare it.`,
          ) +
          (d.reason ? p(`Reason given: <em>${esc(d.reason)}</em>`) : '') +
          brandButton('Open vendor portal', 'https://vendor.feastpot.co.uk/orders', 'vendorBlue'),
      ),
    channels: ['email', 'push'],
  },

  // ---------- Amendments + ETA (FR-AMD-001 / FR-TRK-001) ----------
  order_amendment_proposed: {
    subject: (d) =>
      `${str(d.vendorName, 'Your vendor')} proposed a change to order #${str(d.orderNumber)}`,
    render: (d) => {
      const delta = typeof d.priceDeltaPence === 'number' ? (d.priceDeltaPence as number) : 0;
      const deltaLine = delta < 0 ? p(`<strong>Refund:</strong> ${formatMoney(-delta)}`) : '';
      return baseLayout(
        'Vendor proposed a change',
        h2(`${str(d.vendorName, 'Your vendor')} would like to change your order`) +
          p(`<em>${esc(d.proposedChange, '')}</em>`) +
          deltaLine +
          p('You have 30 minutes to accept or decline. No reply means the change is declined.') +
          brandButton('Review change', trackingUrl(d.orderId), 'teal'),
      );
    },
    sms: (d) =>
      `Feastpot: ${str(d.vendorName, 'Your vendor')} proposed a change to order ${str(d.orderNumber)}: "${str(d.proposedChange)}". Review: ${trackingUrl(d.orderId)}`,
    channels: ['email', 'sms', 'whatsapp', 'push'],
    whatsappTemplate: 'order_amendment_proposed',
  },
  order_amendment_resolved: {
    subject: (d) => (d.accepted ? 'Order change accepted' : 'Order change declined'),
    render: (d) =>
      baseLayout(
        d.accepted ? 'Change accepted' : 'Change declined',
        h2(d.accepted ? 'Change accepted' : 'Change declined') +
          p(`<em>${esc(d.proposedChange, '')}</em>`) +
          (d.accepted && typeof d.priceDeltaPence === 'number' && (d.priceDeltaPence as number) < 0
            ? p(
                `A refund of <strong>${formatMoney(-(d.priceDeltaPence as number))}</strong> is on its way.`,
              )
            : ''),
      ),
    channels: ['email', 'push'],
  },
  order_eta_overdue: {
    subject: (d) => `Your order from ${str(d.vendorName, 'your vendor')} is running late`,
    render: (d) =>
      baseLayout(
        'Order running late',
        h2('Your order is running late') +
          p(
            `Order <strong>${esc(d.orderNumber)}</strong> from ${esc(d.vendorName, 'your vendor')} is past the vendor's stated ETA.`,
          ) +
          p('Use the contact button on the tracking page if you need to reach them.') +
          brandButton('Open tracking', trackingUrl(d.orderId), 'teal'),
      ),
    sms: (d) =>
      `Feastpot: Order ${str(d.orderNumber)} from ${str(d.vendorName, 'your vendor')} is running late. Track: ${trackingUrl(d.orderId)}`,
    channels: ['email', 'sms', 'push'],
  },

  // ---------- Refunds ----------
  refund_issued_customer: {
    subject: (d) => `Refund of ${formatMoney(d.amountPence)} processed`,
    render: (d) =>
      baseLayout(
        'Refund issued',
        h2('Refund issued') +
          p(
            `We've issued a refund of <strong>${formatMoney(d.amountPence)}</strong> for order ${esc(d.orderId)}. It should appear within 5 to 10 working days.`,
          ),
      ),
    channels: ['email', 'push'],
  },
  refund_deducted_vendor: {
    subject: () => 'Refund deducted from upcoming payout',
    render: (d) =>
      baseLayout(
        'Refund deducted',
        h2('Refund deducted from next payout') +
          p(
            `<strong>${formatMoney(d.deductionPence)}</strong> has been deducted from your next weekly payout (order ${esc(d.orderId)}).`,
          ),
      ),
    channels: ['email'],
  },

  // ---------- Payouts ----------
  payout_batch_ready: {
    subject: () => 'Weekly payout statement ready',
    render: (d) => {
      // The canonical share link comes pre-built from the payout batch job as
      // `referralUrl` (derived from VendorReferralLink.slug). We never construct
      // it here from vendorSlug because:
      //   1. Vendor.slug and VendorReferralLink.slug can differ.
      //   2. The attribution click recorder looks up VendorReferralLink by slug;
      //      using Vendor.slug would produce a URL that records no click and sets
      //      no fp_ref, silently attributing orders as marketplace (12%).
      //   3. ?src=vendor is inert - the /v/[slug] route handler ignores it.
      // Older in-flight jobs without referralUrl simply omit the nudge block.
      const shareLink =
        typeof d.referralUrl === 'string' && d.referralUrl ? str(d.referralUrl) : null;

      return baseLayout(
        'Payout ready',
        h2('Your weekly payout is ready') +
          (d.grossPence !== undefined
            ? keyValueRow('Gross sales', formatMoney(d.grossPence))
            : '') +
          (d.commissionPence !== undefined
            ? keyValueRow('Commission deducted', `- ${formatMoney(d.commissionPence)}`)
            : '') +
          keyValueRow('Net payable', formatMoney(d.amountPence ?? d.netPence), { bold: true }) +
          (d.payoutDate ? keyValueRow('Payout date', str(d.payoutDate)) : '') +
          brandButton('View statement', 'https://vendor.feastpot.co.uk/payouts', 'vendorBlue') +
          // "Grow your earnings" nudge: only rendered when vendorSlug is
          // present. Placed after the statement button so the primary action
          // is never buried.
          (shareLink
            ? `<div style="margin-top:28px;padding:16px 18px;background:#f0f9f4;border-radius:8px;border-left:4px solid #00843d">` +
              `<p style="margin:0 0 6px 0;font-size:14px;font-weight:700;color:#005c2b">Grow your earnings</p>` +
              `<p style="margin:0 0 10px 0;font-size:13px;color:#374151;line-height:1.5">` +
              `Orders placed via your personal link attract 0% commission. Share it on Instagram, WhatsApp or anywhere you promote your kitchen and you keep more of every order.` +
              `</p>` +
              `<p style="margin:0;font-size:13px">` +
              `<a href="${shareLink}" style="color:#00843d;font-weight:600;word-break:break-all">${esc(shareLink ?? '')} on Feastpot</a>` +
              `</p>` +
              `</div>`
            : ''),
      );
    },
    channels: ['email', 'whatsapp'],
    whatsappTemplate: 'payout_statement',
  },
  payout_held: {
    subject: () => 'Payout on hold',
    render: (d) =>
      baseLayout(
        'Payout held',
        h2('Payout held') +
          amberCallout(
            `Reason: <strong>${esc(d.holdReason, 'review required')}</strong>. Our team will be in touch shortly.`,
          ),
      ),
    channels: ['email'],
  },

  // Sent to the vendor when all automatic retry attempts for a Stripe transfer
  // are exhausted or a terminal Stripe error is detected (e.g. account_closed,
  // debit_not_authorized). The `errorSummary` field contains a plain-English
  // explanation generated by describeStripeError() in stripe-error-classifier.ts
  // so the vendor knows what to fix, not just that it failed.
  payout_failed_terminal: {
    subject: (d) => `Your Feastpot payout of ${formatMoney(d.amountPence ?? 0)} could not be sent`,
    render: (d) => {
      const stripeDashboardUrl = str(
        d.stripeDashboardUrl,
        'https://connect.stripe.com/express_login',
      );
      const supportEmail = str(d.supportEmail, 'support@feastpot.co.uk');
      const errorSummary = str(
        d.errorSummary,
        'The transfer was declined by Stripe. Please log into your Stripe Express dashboard to review any required actions.',
      );
      return baseLayout(
        'Payout failed',
        h2('Your payout could not be sent') +
          amberCallout(
            `<strong>${formatMoney(d.amountPence ?? 0)}</strong> was not transferred to your bank account.`,
          ) +
          p('<strong>What happened:</strong>') +
          p(esc(errorSummary)) +
          brandButton('Check your Stripe dashboard', stripeDashboardUrl, 'vendorBlue') +
          p(
            `If you need help, email <a href="mailto:${esc(supportEmail)}">${esc(supportEmail)}</a>.`,
          ) +
          p(
            'Our finance team has also been alerted and may reach out if manual resolution is needed.',
          ),
      );
    },
    channels: ['email'],
  },

  // ---------- Disputes ----------
  dispute_raised: {
    subject: (d) => `Dispute opened on order #${str(d.orderNumber)}`,
    render: (d) =>
      baseLayout(
        'Dispute raised',
        h2(`Dispute on order ${str(d.orderNumber)}`) +
          p(
            `A customer has raised a dispute (<strong>${esc(d.issueType, 'issue')}</strong>) on this order.`,
          ) +
          amberCallout(
            'You have <strong>24 hours</strong> to respond before this is escalated to Feastpot support.',
          ) +
          brandButton(
            'Respond to dispute',
            `https://vendor.feastpot.co.uk/disputes/${str(d.disputeId, '')}`,
            'vendorBlue',
          ),
      ),
    sms: (d) =>
      `Feastpot: Dispute opened on order ${str(d.orderNumber)}. Respond within 24h: https://vendor.feastpot.co.uk/disputes/${str(d.disputeId, '')}`,
    // SMS included: disputes carry a hard 24h response window, so vendors away
    // from email/push must still get the deadline on their phone. Not in the
    // preference registry (vendor ops alert) - always delivered.
    channels: ['email', 'sms', 'push'],
  },
  dispute_vendor_responded: {
    subject: () => 'Vendor responded to your dispute',
    render: (d) =>
      baseLayout(
        'Vendor responded',
        h2('The vendor has responded') +
          p('Our support team is reviewing the case.') +
          // vendorResponse is vendor-supplied free text - MUST be escaped before
          // landing inside the blockquote, otherwise vendors can inject HTML
          // into customer email inboxes.
          `<blockquote style="margin:12px 0;padding:12px 14px;border-left:3px solid #BDBBB7;background:#F8F7F5;border-radius:0 8px 8px 0;color:#1C1C1A;font-size:14px">${esc(d.vendorResponse)}</blockquote>`,
      ),
    channels: ['email', 'push'],
  },
  dispute_escalated: {
    subject: (d) => `Your dispute on order #${str(d.orderNumber)} has been escalated`,
    render: (d) =>
      baseLayout(
        'Dispute escalated',
        h2('Your dispute has been escalated') +
          p(
            `Your dispute on order <strong>${esc(d.orderNumber)}</strong> has been escalated to Feastpot's admin team for review.`,
          ) +
          p('A senior member of our team will resolve this case and let you know the outcome.'),
      ),
    channels: ['email', 'push'],
  },
  dispute_resolved: {
    subject: () => 'Your dispute has been resolved',
    render: (d) =>
      baseLayout(
        'Dispute resolved',
        h2('Dispute resolved') +
          p(`Resolution: <strong>${esc(d.resolution)}</strong>.`) +
          (d.resolutionNote ? p(esc(d.resolutionNote)) : ''),
      ),
    channels: ['email', 'push'],
  },

  // ---------- Compliance ----------
  document_expiring: {
    subject: (d) =>
      `⚠️ Action required - ${str(d.documentType, 'document')} expires in ${str(d.daysUntilExpiry, '?')} days`,
    render: (d) =>
      baseLayout(
        'Document expiring',
        h2('Document expiring soon') +
          amberCallout(
            `Your <strong>${esc(d.documentType)}</strong> expires on <strong>${esc(String(d.expiresAt ?? '').slice(0, 10))}</strong> (${esc(d.daysUntilExpiry, '?')} days).`,
          ) +
          p('Please upload a renewal in your vendor portal to avoid any pause to orders.') +
          brandButton('Upload renewal', 'https://vendor.feastpot.co.uk/onboarding', 'vendorBlue'),
      ),
    channels: ['email'],
  },
  document_expired: {
    subject: (d) => `${str(d.documentType, 'Document')} EXPIRED`,
    render: (d) =>
      baseLayout(
        'Document expired',
        h2('Document expired') +
          amberCallout(
            `Vendor ${esc(d.vendorName, str(d.vendorId))} has an expired <strong>${esc(d.documentType)}</strong> with no renewal on file.`,
          ),
      ),
    channels: ['email'],
  },

  // ---------- Vendor verification ----------
  verification_renewal_due: {
    subject: (d) =>
      `Action required: Feastpot verification renewal due for ${str(d.vendorName, 'your kitchen')}`,
    render: (d) => {
      const fields = Array.isArray(d.expiringFields) ? (d.expiringFields as string[]) : [];
      const fieldList =
        fields.length > 0 ? fields.join(', ') : 'one or more verification documents';
      const complianceEmail = str(d.complianceEmail, 'compliance@feastpot.co.uk');
      return baseLayout(
        'Verification renewal due',
        h2('Your verification documents are expiring soon') +
          amberCallout(`<strong>${esc(fieldList)}</strong> will expire within the next 30 days.`) +
          p(
            'Your listing is still visible to customers right now. If the documents are not renewed before they expire, your listing will be paused and you will stop receiving new orders.',
          ) +
          p(
            '<strong>What to do:</strong> upload renewed documents in the vendor portal by clicking the button below.',
          ) +
          brandButton(
            'Upload renewal documents',
            'https://vendor.feastpot.co.uk/compliance',
            'vendorBlue',
          ) +
          p(
            `If you have already renewed and need to let us know, email <a href="mailto:${esc(complianceEmail)}">${esc(complianceEmail)}</a>.`,
          ),
      );
    },
    channels: ['email'],
  },
  verification_suspended: {
    subject: (d) =>
      `Your Feastpot listing has been suspended: ${str(d.vendorName, 'your kitchen')}`,
    render: (d) => {
      const appealWindowDays = typeof d.appealWindowDays === 'number' ? d.appealWindowDays : 14;
      const appealsEmail = str(d.appealsEmail, 'appeals@feastpot.co.uk');
      const complianceEmail = str(d.complianceEmail, 'compliance@feastpot.co.uk');
      const pendingOrderCount = typeof d.pendingOrderCount === 'number' ? d.pendingOrderCount : 0;

      return baseLayout(
        'Listing suspended',
        h2('Your listing has been suspended') +
          amberCallout(
            'Your listing is suspended. You are not visible to customers and cannot receive new orders.',
          ) +
          p(
            'Your listing was suspended because a verification requirement is no longer met. ' +
              'This could be an expired insurance certificate, expired allergen training, or a hygiene rating below the minimum.',
          ) +
          (pendingOrderCount > 0
            ? p(
                `<strong>You have ${pendingOrderCount} accepted order${pendingOrderCount === 1 ? '' : 's'} that you must still fulfil.</strong> ` +
                  'Customers who have already placed an order with you are expecting delivery as agreed. ' +
                  'You must complete those orders even though your listing is suspended.',
              )
            : '') +
          p('<strong>What you need to do:</strong>') +
          p(
            '1. Upload the required document(s) in the vendor portal. Your listing will be restored once the documents are verified.' +
              `<br>2. If you believe this suspension is an error, email <a href="mailto:${esc(complianceEmail)}">${esc(complianceEmail)}</a>.`,
          ) +
          brandButton(
            'Go to compliance in vendor portal',
            'https://vendor.feastpot.co.uk/compliance',
            'vendorBlue',
          ) +
          p(
            `<strong>Appealing this decision:</strong> you have ${appealWindowDays} calendar days from today to submit a formal appeal. ` +
              `Email <a href="mailto:${esc(appealsEmail)}">${esc(appealsEmail)}</a> with your vendor name and a short explanation. ` +
              'Appeals are reviewed within 5 business days.',
          ),
      );
    },
    channels: ['email'],
  },
  // ---------- Account power tools (FR-ADM-002) ----------
  account_credit_issued: {
    subject: (d) => `You've received ${formatMoney(d.amountPence)} in Feastpot credit`,
    render: (d) =>
      baseLayout(
        'Credit added to your account',
        h2('Credit added to your account') +
          p(
            `Hi${d.customerName ? ` ${esc(d.customerName)}` : ''}, our team has added <strong>${formatMoney(d.amountPence)}</strong> in credit to your Feastpot account.`,
          ) +
          (d.reason ? p(`Reason: <em>${esc(d.reason)}</em>`) : '') +
          p('It will be applied automatically at checkout on your next order.') +
          brandButton('Open Feastpot', 'https://feastpot.co.uk/account'),
      ),
    channels: ['email', 'push'],
  },
  account_suspended: {
    subject: () => 'Your Feastpot account has been suspended',
    render: (d) =>
      baseLayout(
        'Account suspended',
        h2('Account suspended') +
          p('Your Feastpot account has been temporarily suspended.') +
          (d.reason ? amberCallout(`Reason: ${esc(d.reason)}`) : '') +
          p(
            'If you believe this was made in error, reply to this email or contact <a href="mailto:support@feastpot.co.uk">support@feastpot.co.uk</a>.',
          ),
      ),
    channels: ['email'],
  },
  // ---------- Vendor order alerts ----------
  /**
   * Vendor-facing "new paid order" alert, enqueued by
   * OrdersService.confirmPayment as `notify_vendor`. The vendor also gets an
   * inbox row; this covers email + push so they hear about it away from the
   * portal. Recipient is resolved via `vendorUserId` in the payload.
   */
  notify_vendor: {
    subject: (d) => `New order ${str(d.orderNumber)} 🛎️`,
    render: (d) =>
      baseLayout(
        'New order received',
        h2(`You have a new order${d.orderNumber ? `: ${esc(d.orderNumber)}` : ''}`) +
          keyValueRow('Total', formatMoney(d.totalPence), { bold: true }) +
          (d.scheduledFor ? keyValueRow('Scheduled for', str(d.scheduledFor)) : '') +
          p('Please accept the order in your portal so the customer knows it is in the kitchen.') +
          brandButton('View order', 'https://vendor.feastpot.co.uk/orders', 'vendorBlue'),
        `New order ${str(d.orderNumber)}`,
      ),
    channels: ['email', 'push'],
  },

  // ---------- Vendor onboarding ----------
  /**
   * Sent once a vendor has completed all four self-serve onboarding steps
   * (profile + docs + Stripe + first menu items). Bridges the gap between
   * "I clicked submit" and "compliance approved me to go live" - without
   * it the vendor sits in silence for up to 2 business days wondering if
   * they did something wrong.
   *
   * Wiring is a follow-up: today the four "done" flags are computed
   * client-side and there's no single API endpoint that fires once when
   * everything's complete. Two options for the wire-up:
   *  1. Add a one-shot POST /v1/vendors/me/onboarding-complete the
   *     vendor portal calls when canGoLive flips true (server uses a
   *     `Vendor.onboardingCompletedAt` flag for idempotency).
   *  2. Fire on the first `compliance.approveVendor` admin action
   *     (closer to the user-facing "you're approved" event).
   * The template is registered here so the dispatch site can be added
   * without a second template change.
   */
  vendor_onboarding_complete: {
    subject: () => "Welcome to Feastpot! Here's what happens next 🍲",
    render: (d) =>
      baseLayout(
        "You've done the hard part",
        h2("You've done the hard part") +
          p(
            `Thanks${d.vendorName ? `, ${esc(d.vendorName)}` : ''}, for finishing your onboarding. Your menu, documents, and payout details are all in.`,
          ) +
          h2('What happens next') +
          // Lists must be raw <ol>/<ul> strings - wrapping them in p() would
          // emit <p><ol>…</ol></p>, which is invalid HTML and renders
          // inconsistently across Outlook / Gmail / Apple Mail.
          '<ol style="margin:0 0 14px 20px;padding:0;color:#1C1C1A;font-size:14px;line-height:1.6">' +
          '<li>Your documents are reviewed within <strong>2 business days</strong>.</li>' +
          "<li>We'll email you the moment you're approved.</li>" +
          '<li>Once approved, your menu goes live and customers can find you in search.</li>' +
          '</ol>' +
          h2('While you wait - set yourself up to win') +
          '<ul style="margin:0 0 14px 20px;padding:0;color:#1C1C1A;font-size:14px;line-height:1.6">' +
          '<li>Add more menu items - <strong>3 minimum, 8+ recommended</strong>.</li>' +
          '<li>Upload real food photos. This is the single biggest driver of orders.</li>' +
          '<li>Set clear delivery days and times so customers know when to expect you.</li>' +
          '</ul>' +
          brandButton(
            'Open vendor portal',
            'https://vendor.feastpot.co.uk/onboarding',
            'vendorBlue',
          ) +
          p(
            'Questions? Email <a href="mailto:support@feastpot.co.uk">support@feastpot.co.uk</a> or message us on WhatsApp.',
            '#5F5E5A',
          ),
      ),
    channels: ['email'],
  },

  vendor_approved: {
    subject: (d) =>
      `You're approved! ${str(d.businessName, 'Your kitchen')} is now live on Feastpot 🎉`,
    render: (d) =>
      baseLayout(
        'Welcome to Feastpot',
        h2(`Congratulations${d.vendorFirstName ? `, ${esc(d.vendorFirstName)}` : ''}!`) +
          p(
            `<strong>${esc(d.businessName, 'Your kitchen')}</strong> has been approved and is now live on Feastpot. Customers in your area can now find your menu and place orders.`,
          ) +
          p('Here is what to do next:') +
          // Lists must be raw <ol> strings - wrapping them in p() emits
          // <p><ol>…</ol></p>, which is invalid HTML and renders
          // inconsistently across Outlook / Gmail / Apple Mail.
          '<ol style="margin:0 0 16px 20px;padding:0;color:#5F5E5A;font-size:14px;line-height:1.8">' +
          '<li>Add your food photos to every menu item - vendors with photos get 3× more orders.</li>' +
          '<li>Set your delivery days and hours in <strong>Settings → Delivery</strong>.</li>' +
          '<li>Share your vendor profile link with your community.</li>' +
          '<li>Check your vendor dashboard daily for new orders.</li>' +
          '</ol>' +
          brandButton(
            'Go to your dashboard',
            str(d.portalUrl, 'https://vendor.feastpot.co.uk'),
            'green',
          ) +
          p(
            `Questions? Email us at <a href="mailto:${esc(d.supportEmail, 'info@feastpot.co.uk')}" style="color:#00843D">${esc(d.supportEmail, 'info@feastpot.co.uk')}</a> - we reply within 1 business day.`,
            '#5F5E5A',
          ),
        "Your Feastpot kitchen is open - let's get cooking",
      ),
    channels: ['email'],
  },

  enquiry_expired: {
    subject: () => 'Your event enquiry has expired',
    render: (d) =>
      baseLayout(
        'Enquiry expired',
        h2("We didn't hear back from any vendors in time") +
          p(
            "Your event enquiry stayed open for 48 hours without a quote, so we've closed it as expired. We're sorry - vendor responsiveness during peak weeks isn't always what we'd like.",
          ) +
          p(
            'If you still want to host this event, the easiest next step is to submit a fresh enquiry - that puts you back in front of every vendor in your area, including any that have just opened up new availability.',
          ) +
          brandButton('Submit a new enquiry', 'https://feastpot.co.uk/events/new', 'orange') +
          p(
            `Questions or want help finding a vendor directly? Email <a href="mailto:support@feastpot.co.uk" style="color:#E8520A">support@feastpot.co.uk</a> with your enquiry reference (${esc(d.enquiryId)}) and we'll see what we can do.`,
            '#5F5E5A',
          ),
        'No quote within 48h - enquiry closed',
      ),
    channels: ['email'],
  },

  review_request: {
    subject: (d) => `How was your food from ${str(d.vendorName, 'your vendor')}? ⭐`,
    render: (d) =>
      baseLayout(
        'Leave a review',
        h2('★★★★★') +
          p(
            `How was your food from <strong>${esc(d.vendorName, 'your vendor')}</strong>? Order ${esc(d.orderNumber)} arrived a couple of hours ago - would you mind leaving a quick review?`,
          ) +
          brandButton('Leave a review', reviewUrl(d.orderId), 'teal'),
      ),
    channels: ['email', 'whatsapp', 'push'],
    whatsappTemplate: 'review_request',
  },

  // ── Dispute appeals (clause 18.1-18.3) ───────────────────────────────────

  dispute_appeal_submitted: {
    subject: () => 'New dispute appeal submitted',
    render: (d) =>
      baseLayout(
        'New dispute appeal',
        h2('New dispute appeal requires review') +
          p(
            `A vendor has submitted an appeal on dispute <strong>${esc(d.orderNumber)}</strong> ` +
              `(${esc(d.vendorName)}).`,
          ) +
          `<div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">` +
          `<p style="margin:0 0 4px 0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Grounds summary</p>` +
          `<p style="margin:0;font-size:14px;line-height:1.6;color:#111827;">${esc(d.groundsPreview)}${str(d.groundsPreview).length >= 200 ? '...' : ''}</p>` +
          `</div>` +
          brandButton(
            'Review appeal',
            'https://admin.feastpot.co.uk/disputes/' + str(d.disputeId),
            'vendorBlue',
          ),
      ),
    channels: ['email'],
  },

  dispute_appeal_decided: {
    subject: (d) => {
      const stage = str(d.stage, '');
      const outcome = str(d.outcome, '');
      const isFinal = d.isFinal === true;
      return isFinal
        ? `Your dispute appeal outcome: ${outcome}`
        : `Stage ${stage} appeal review complete: ${outcome}`;
    },
    render: (d) => {
      const outcome = str(d.outcome, '');
      const stage = str(d.stage, '');
      const isFinal = d.isFinal === true;
      const outcomeColour =
        outcome === 'UPHELD' ? '#16a34a' : outcome === 'OVERTURNED' ? '#dc2626' : '#d97706';
      const heading = isFinal ? 'Final appeal decision' : `Stage ${stage} review complete`;

      return baseLayout(
        heading,
        h2(heading) +
          `<div style="text-align:center;padding:16px 0;">` +
          `<span style="display:inline-block;background:${outcomeColour};color:#fff;border-radius:24px;padding:6px 20px;font-size:16px;font-weight:700;">${esc(outcome)}</span>` +
          `</div>` +
          `<div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">` +
          `<p style="margin:0 0 4px 0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Reviewer reasons</p>` +
          `<p style="margin:0;font-size:14px;line-height:1.6;color:#111827;">${esc(d.reasons)}</p>` +
          `</div>` +
          (isFinal && outcome === 'UPHELD'
            ? p(
                'Your appeal has been upheld. The deduction has been reversed and will appear in your next payout statement.',
              )
            : '') +
          (!isFinal && d.canEscalate
            ? p(
                'You may request Stage 2 review if you believe the Stage 1 decision was incorrect. Please contact <a href="mailto:appeals@feastpot.co.uk">appeals@feastpot.co.uk</a>.',
              )
            : '') +
          brandButton(
            'View dispute',
            'https://vendor.feastpot.co.uk/disputes/' + str(d.disputeId),
            'vendorBlue',
          ),
      );
    },
    channels: ['email'],
  },

  dispute_appeal_payout_credit: {
    subject: () => 'Appeal credit added to your next payout',
    render: (d) => {
      const pounds = (Number(d.creditPence) / 100).toFixed(2);
      return baseLayout(
        'Appeal payout credit',
        h2('Your appeal credit has been processed') +
          p(
            `A credit of <strong>GBP ${esc(pounds)}</strong> has been added to your next payout ` +
              `following your successful appeal (dispute ${esc(d.disputeId)}).`,
          ) +
          p('You will see this in your earnings statement on the next payout cycle.') +
          brandButton('View earnings', 'https://vendor.feastpot.co.uk/earnings', 'vendorBlue'),
      );
    },
    channels: ['email'],
  },

  // ── P2B enforcement notices (clause 14.1) ────────────────────────────────

  enforcement_action: {
    subject: (d) => {
      const typeLabel: Record<string, string> = {
        RESTRICTION: 'restricted',
        SUSPENSION: 'suspended',
        TERMINATION: 'terminated',
      };
      const verb = typeLabel[str(d.actionType)] ?? 'affected';
      return `Important notice: your Feastpot listing has been ${verb}`;
    },
    render: (d) => {
      const actionType = str(d.actionType);
      const heading: Record<string, string> = {
        RESTRICTION: 'Your listing has been restricted',
        SUSPENSION: 'Your listing has been suspended',
        TERMINATION: 'Notice of termination',
      };
      const effectiveDate = d.effectiveAt
        ? new Date(str(d.effectiveAt)).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : 'immediately';
      const appealDate = d.appealDeadline
        ? new Date(str(d.appealDeadline)).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : '';
      const isUrgent = d.isUrgent === true;

      return baseLayout(
        heading[actionType] ?? 'Enforcement notice',
        h2(heading[actionType] ?? 'Enforcement notice') +
          (isUrgent
            ? amberCallout(
                `This action has taken effect immediately for reasons of food safety, security, or fraud. ` +
                  `The reasons are set out below (vendor terms clause ${esc(d.clauseRef, '14.1')}).`,
              )
            : amberCallout(
                `This action takes effect on <strong>${effectiveDate}</strong> under vendor terms clause ${esc(d.clauseRef, '14.1')}.`,
              )) +
          `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse;">` +
          keyValueRow('Reason code', esc(d.reasonCode)) +
          `</table>` +
          `<div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">` +
          `<p style="margin:0 0 4px 0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Statement of reasons</p>` +
          `<p style="margin:0;font-size:14px;line-height:1.6;color:#111827;">${esc(d.reasonNarrative)}</p>` +
          `</div>` +
          p(`<strong>Effective date:</strong> ${effectiveDate}`) +
          `<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">` +
          h2('Your right to appeal') +
          p(
            `You may appeal this decision under vendor terms clause ${esc(d.appealClause, '18.1')}. ` +
              `To submit an appeal, reply to this email or contact <a href="mailto:appeals@feastpot.co.uk">appeals@feastpot.co.uk</a> ` +
              `with the subject line <strong>"Appeal: ${esc(d.reasonCode)}"</strong> and your grounds of appeal.`,
          ) +
          (appealDate
            ? p(
                `<strong>Appeal deadline: ${appealDate}</strong> (14 days from the effective date).`,
              )
            : '') +
          p(
            `You may also seek independent legal advice or contact the UK Courts Service ` +
              `if you believe this decision is unlawful.`,
          ) +
          brandButton(
            'Open vendor portal',
            'https://vendor.feastpot.co.uk/account-status',
            'vendorBlue',
          ),
      );
    },
    channels: ['email'],
  },

  enforcement_lifted: {
    subject: (d) => {
      const typeLabel: Record<string, string> = {
        RESTRICTION: 'restriction lifted',
        SUSPENSION: 'listing restored',
        TERMINATION: 'termination notice withdrawn',
      };
      return `Good news: your Feastpot ${typeLabel[str(d.actionType)] ?? 'enforcement action lifted'}`;
    },
    render: (d) =>
      baseLayout(
        'Enforcement action lifted',
        h2('Your listing has been restored') +
          p(
            `The ${str(d.actionType, 'enforcement action').toLowerCase()} on your Feastpot listing ` +
              `(<strong>${esc(d.vendorName, 'your kitchen')}</strong>) has been lifted.`,
          ) +
          (d.liftNote
            ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">` +
              `<p style="margin:0;font-size:14px;line-height:1.6;color:#111827;">${esc(d.liftNote)}</p>` +
              `</div>`
            : '') +
          p('Your listing is now active again. Thank you for resolving the matter.') +
          brandButton('Open vendor portal', 'https://vendor.feastpot.co.uk/', 'vendorBlue'),
      ),
    channels: ['email'],
  },
  // ── HMRC digital platform reporting (SI 2023/817) ───────────────────────

  hmrc_copy_sent: {
    subject: (d) => `Your ${str(d.reportingYear)} tax information report - Feastpot`,
    render: (d) => {
      const qb = d.quarterlyBreakdown as Record<
        string,
        { grossPence: number; feesPence: number; orderCount: number }
      > | null;
      const quarterRows = ['q1', 'q2', 'q3', 'q4']
        .map((q) => {
          const data = qb?.[q];
          if (!data) return '';
          const label = q.toUpperCase().replace('Q', 'Q') + ' ' + str(d.reportingYear);
          return keyValueRow(
            label,
            `${formatMoney(data.grossPence)} gross, ${data.orderCount} orders`,
          );
        })
        .join('');

      return baseLayout(
        `${str(d.reportingYear)} Annual Tax Report`,
        h2(`Your ${str(d.reportingYear)} annual report`) +
          p(
            `Under the Platform Operators (Due Diligence and Reporting Requirements) Regulations 2023 ` +
              `(SI 2023/817), Feastpot is required to report the following information about your activity ` +
              `on our platform to HMRC. This is your copy of the information reported.`,
          ) +
          `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">` +
          keyValueRow('Legal name', esc(d.businessName)) +
          keyValueRow('Reporting year', str(d.reportingYear)) +
          keyValueRow('Gross consideration', `GBP ${esc(d.grossPounds)}`) +
          keyValueRow('Platform fees deducted', `GBP ${esc(d.feesPounds)}`) +
          keyValueRow('Total transactions', str(d.orderCount)) +
          quarterRows +
          `</table>` +
          p(
            'If any of the information above is incorrect, please contact ' +
              '<a href="mailto:compliance@feastpot.co.uk">compliance@feastpot.co.uk</a> ' +
              'within 60 days. Keep this email for your tax records.',
          ) +
          brandButton(
            'View tax information',
            'https://vendor.feastpot.co.uk/tax-information',
            'vendorBlue',
          ),
      );
    },
    channels: ['email'],
  },

  hmrc_deadline_alert: {
    subject: (d) => `Action required: HMRC reporting deadline ${str(d.deadline)}`,
    render: (d) =>
      baseLayout(
        'HMRC reporting deadline approaching',
        h2('HMRC submission deadline approaching') +
          `<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:16px;margin:16px 0;text-align:center;">` +
          `<p style="margin:0;font-size:18px;font-weight:700;color:#92400e;">Deadline: ${esc(d.deadline)}</p>` +
          `</div>` +
          p(
            `The annual HMRC digital platform report for ${str(d.reportingYear)} must be submitted on or before <strong>${esc(d.deadline)}</strong> ` +
              `under the Platform Operators (Due Diligence and Reporting Requirements) Regulations 2023.`,
          ) +
          `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">` +
          keyValueRow('Reporting year', str(d.reportingYear)) +
          keyValueRow('Vendor reports generated', str(d.reportCount)) +
          keyValueRow('Copies still to send', str(d.unsentCopies)) +
          `</table>` +
          p(
            'Log in to the admin panel to review and submit to HMRC, or trigger the send-copies job if vendor copies have not yet been dispatched.',
          ) +
          brandButton(
            'Open admin panel',
            'https://admin.feastpot.co.uk/platform-reports',
            'vendorBlue',
          ),
      ),
    channels: ['email'],
  },

  hmrc_verification_failed: {
    subject: () => 'Action required: tax information needs updating - Feastpot',
    render: (d) =>
      baseLayout(
        'Tax information update required',
        h2('We could not verify your tax information') +
          p(
            `We were unable to verify the tax information you provided for <strong>${esc(d.businessName)}</strong>. ` +
              `This is required by the Platform Operators (Due Diligence and Reporting Requirements) Regulations 2023 (SI 2023/817).`,
          ) +
          (d.note
            ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:16px 0;">` +
              `<p style="margin:0 0 4px 0;font-size:12px;font-weight:600;text-transform:uppercase;color:#991b1b;">Note from compliance team</p>` +
              `<p style="margin:0;font-size:14px;line-height:1.6;color:#111827;">${esc(d.note)}</p>` +
              `</div>`
            : '') +
          p(
            'Please log in to the vendor portal and update your tax information. ' +
              'Your listing may be paused until this is resolved.',
          ) +
          brandButton(
            'Update tax information',
            'https://vendor.feastpot.co.uk/tax-information',
            'vendorBlue',
          ),
      ),
    channels: ['email'],
  },
  // ---------- Catering assignment ----------

  catering_assignment: {
    subject: (d) =>
      `New catering enquiry for you: ${str(d.guestCountBand, '?')} guests in ${str(d.postcode, '?')}`,
    render: (d) =>
      baseLayout(
        'Catering enquiry assigned to you',
        h2('You have a new catering enquiry') +
          p(
            `Feastpot has routed a catering enquiry to you. Please log in to the vendor portal and submit your quote within 48 hours.`,
          ) +
          keyValueRow('Event type', esc(d.occasionType ?? 'Catering')) +
          keyValueRow('Guest count', esc(d.guestCountBand, '?')) +
          keyValueRow('Event date', esc(d.eventDate ?? 'TBC')) +
          keyValueRow('Location', esc(d.postcode, '?')) +
          (str(d.cuisineStyle) ? keyValueRow('Cuisine preference', esc(d.cuisineStyle)) : '') +
          (str(d.note) ? amberCallout(`Admin note: ${esc(d.note)}`) : '') +
          brandButton(
            'View enquiry & submit quote',
            'https://vendor.feastpot.co.uk/orders',
            'vendorBlue',
          ),
      ),
    channels: ['email'],
  },

  catering_assignment_cancelled: {
    subject: () => 'Catering assignment cancelled',
    render: (d) =>
      baseLayout(
        'Catering assignment cancelled',
        h2('A catering assignment has been cancelled') +
          p(
            `A catering booking assigned to you has been cancelled by Feastpot. No action is required.`,
          ) +
          (str(d.reason) ? amberCallout(`Reason: ${esc(d.reason)}`) : '') +
          p('If you have any questions, please contact us at hello@feastpot.co.uk.'),
      ),
    channels: ['email'],
  },
};

export function getTemplate(eventName: string): NotificationTemplate | undefined {
  return TEMPLATES[eventName];
}
