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
 * events are logged and dropped — we never silently invent body text.
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

/** Plain string coercion — UNESCAPED. Use for subjects, SMS bodies, and URL components. */
const str = (v: unknown, fallback = ''): string =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : fallback;

/**
 * Escaped string coercion — USE WHENEVER interpolating user-controlled
 * data inside an HTML body (p / amberCallout / raw <…> strings).
 */
const esc = (v: unknown, fallback = ''): string => escapeHtml(str(v, fallback));

const trackingUrl = (orderId: unknown): string =>
  `https://feastpot.co.uk/orders/${str(orderId, 'unknown')}/tracking`;

const reviewUrl = (orderId: unknown): string =>
  `https://feastpot.co.uk/orders/${str(orderId, 'unknown')}/review`;

export const TEMPLATES: Record<string, NotificationTemplate> = {
  // ---------- Events ----------
  event_enquiry_matched: {
    subject: (d) => `New event enquiry: ${str(d.eventType, 'event')} for ${str(d.guestCount, '?')}`,
    render: (d) =>
      baseLayout(
        'New event enquiry',
        h2('New event enquiry') +
          p(`You've been matched to a new event: <strong>${esc(d.eventType, 'event')}</strong> for ${esc(d.guestCount, '?')} guests on ${esc(d.eventDate)} (${esc(d.postcode)}).`) +
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
          p(`A vendor has submitted a quote for <strong>${formatMoney(d.totalPence)}</strong>. Review and choose in the app.`) +
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
          p(`Your event is on ${esc(d.eventDate)}. Please confirm your final guest count (currently ${esc(d.guestCount, '?')}).`) +
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
      const items = Array.isArray(d.items) ? (d.items as Array<{ name: string; qty: number; pricePence: number }>) : [];
      const orderNumber = str(d.orderNumber);
      return baseLayout(
        'Order confirmed',
        h2(`Thanks${d.customerName ? ', ' + str(d.customerName) : ''} — your order is confirmed!`) +
          p(`<strong>${esc(d.vendorName, 'Your vendor')}</strong> has received order <strong>${esc(orderNumber)}</strong> and will accept it shortly.`) +
          (items.length ? itemsTable(items) : '') +
          keyValueRow('Total', formatMoney(d.totalPence), { bold: true }) +
          (d.scheduledFor ? keyValueRow('Scheduled for', str(d.scheduledFor)) : '') +
          brandButton('Track your order', trackingUrl(d.orderId)),
        `Order ${orderNumber} confirmed — total ${formatMoney(d.totalPence)}`,
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
          p(`Order <strong>${esc(d.orderNumber)}</strong> from ${esc(d.vendorName, 'your vendor')} just left the kitchen.`) +
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
    subject: () => `Order delivered — leave a review ⭐`,
    render: (d) => {
      const points = typeof d.loyaltyPointsEarned === 'number' ? (d.loyaltyPointsEarned as number) : 0;
      return baseLayout(
        'Delivered',
        h2('Enjoy!') +
          p(`We hope order <strong>${esc(d.orderNumber, 'your order')}</strong> from ${esc(d.vendorName, 'your vendor')} hit the spot.`) +
          (points > 0 ? `<div style="margin:14px 0">${tealPill(`+${points} loyalty points earned`)}</div>` : '') +
          brandButton('Leave a review', reviewUrl(d.orderId), 'teal'),
      );
    },
    channels: ['email', 'whatsapp', 'push'],
    whatsappTemplate: 'delivery_confirmed',
  },

  // ---------- Refunds ----------
  refund_issued_customer: {
    subject: (d) => `Refund of ${formatMoney(d.amountPence)} processed`,
    render: (d) =>
      baseLayout(
        'Refund issued',
        h2('Refund issued') +
          p(`We've issued a refund of <strong>${formatMoney(d.amountPence)}</strong> for order ${esc(d.orderId)}. It should appear within 5–10 working days.`),
      ),
    channels: ['email', 'push'],
  },
  refund_deducted_vendor: {
    subject: () => 'Refund deducted from upcoming payout',
    render: (d) =>
      baseLayout(
        'Refund deducted',
        h2('Refund deducted from next payout') +
          p(`<strong>${formatMoney(d.deductionPence)}</strong> has been deducted from your next weekly payout (order ${esc(d.orderId)}).`),
      ),
    channels: ['email'],
  },

  // ---------- Payouts ----------
  payout_batch_ready: {
    subject: () => 'Weekly payout statement ready',
    render: (d) =>
      baseLayout(
        'Payout ready',
        h2('Your weekly payout is ready') +
          (d.grossPence !== undefined ? keyValueRow('Gross sales', formatMoney(d.grossPence)) : '') +
          (d.commissionPence !== undefined ? keyValueRow('Commission deducted', `– ${formatMoney(d.commissionPence)}`) : '') +
          keyValueRow('Net payable', formatMoney(d.amountPence ?? d.netPence), { bold: true }) +
          (d.payoutDate ? keyValueRow('Payout date', str(d.payoutDate)) : '') +
          brandButton('View statement', 'https://vendor.feastpot.co.uk/payouts', 'vendorBlue'),
      ),
    channels: ['email', 'whatsapp'],
    whatsappTemplate: 'payout_statement',
  },
  payout_held: {
    subject: () => 'Payout on hold',
    render: (d) =>
      baseLayout(
        'Payout held',
        h2('Payout held') +
          amberCallout(`Reason: <strong>${esc(d.holdReason, 'review required')}</strong>. Our team will be in touch shortly.`),
      ),
    channels: ['email'],
  },

  // ---------- Disputes ----------
  dispute_raised: {
    subject: (d) => `Dispute opened on order #${str(d.orderNumber)}`,
    render: (d) =>
      baseLayout(
        'Dispute raised',
        h2(`Dispute on order ${str(d.orderNumber)}`) +
          p(`A customer has raised a dispute (<strong>${esc(d.issueType, 'issue')}</strong>) on this order.`) +
          amberCallout('You have <strong>24 hours</strong> to respond before this is escalated to Feastpot support.') +
          brandButton('Respond to dispute', `https://vendor.feastpot.co.uk/disputes/${str(d.disputeId, '')}`, 'vendorBlue'),
      ),
    sms: (d) =>
      `Feastpot: Dispute opened on order ${str(d.orderNumber)}. Respond within 24h: https://vendor.feastpot.co.uk/disputes/${str(d.disputeId, '')}`,
    channels: ['email', 'push'],
  },
  dispute_vendor_responded: {
    subject: () => 'Vendor responded to your dispute',
    render: (d) =>
      baseLayout(
        'Vendor responded',
        h2('The vendor has responded') +
          p('Our support team is reviewing the case.') +
          // vendorResponse is vendor-supplied free text — MUST be escaped before
          // landing inside the blockquote, otherwise vendors can inject HTML
          // into customer email inboxes.
          `<blockquote style="margin:12px 0;padding:12px 14px;border-left:3px solid #BDBBB7;background:#F8F7F5;border-radius:0 8px 8px 0;color:#1C1C1A;font-size:14px">${esc(d.vendorResponse)}</blockquote>`,
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
    subject: (d) => `⚠️ Action required — ${str(d.documentType, 'document')} expires in ${str(d.daysUntilExpiry, '?')} days`,
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
          amberCallout(`Vendor ${esc(d.vendorName, str(d.vendorId))} has an expired <strong>${esc(d.documentType)}</strong> with no renewal on file.`),
      ),
    channels: ['email'],
  },
  review_request: {
    subject: (d) => `How was your food from ${str(d.vendorName, 'your vendor')}? ⭐`,
    render: (d) =>
      baseLayout(
        'Leave a review',
        h2('★★★★★') +
          p(`How was your food from <strong>${esc(d.vendorName, 'your vendor')}</strong>? Order ${esc(d.orderNumber)} arrived a couple of hours ago — would you mind leaving a quick review?`) +
          brandButton('Leave a review', reviewUrl(d.orderId), 'teal'),
      ),
    channels: ['email', 'whatsapp', 'push'],
    whatsappTemplate: 'review_request',
  },
};

export function getTemplate(eventName: string): NotificationTemplate | undefined {
  return TEMPLATES[eventName];
}
