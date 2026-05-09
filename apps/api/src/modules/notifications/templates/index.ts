/**
 * Notification template registry.
 *
 * Each event maps to:
 *   - subject (for email/push title)
 *   - render(data) → html (used by email; also used as `body` for push/whatsapp text fallback)
 *   - channels: which delivery channels to attempt for this event
 *   - whatsappTemplate?: pre-approved Meta template name (when channels includes whatsapp)
 *
 * Adding a new event: register here so the processor can route it. Unknown
 * events are logged and dropped — we never silently invent body text.
 */

export type Channel = 'email' | 'whatsapp' | 'sms' | 'push';

export interface NotificationTemplate {
  subject: (data: Record<string, unknown>) => string;
  render: (data: Record<string, unknown>) => string;
  channels: Channel[];
  whatsappTemplate?: string;
}

const wrapHtml = (title: string, body: string): string => `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f7f6f2;margin:0;padding:24px">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;padding:32px">
    <tr><td><h1 style="color:#1a1a1a;font-size:20px;margin:0 0 16px">${title}</h1>${body}</td></tr>
    <tr><td style="padding-top:24px;color:#888;font-size:12px">— Feastpot · uk diaspora bulk food marketplace</td></tr>
  </table></body></html>`;

const money = (p: unknown): string =>
  typeof p === 'number' ? `£${(p / 100).toFixed(2)}` : '—';

export const TEMPLATES: Record<string, NotificationTemplate> = {
  // ---------- Orders ----------
  order_confirmation: {
    subject: (d) => `Order ${d.orderNumber ?? ''} confirmed`,
    render: (d) => wrapHtml('Thanks for your order',
      `<p>Your order <strong>${d.orderNumber ?? ''}</strong> for ${money(d.totalPence)} is in the kitchen.</p>`),
    channels: ['email', 'whatsapp', 'push'],
    whatsappTemplate: 'order_confirmation',
  },
  order_accepted: {
    subject: (d) => `Order ${d.orderNumber ?? ''} accepted`,
    render: (d) => wrapHtml('Your vendor accepted', `<p>${d.vendorName ?? 'The vendor'} is preparing your order.</p>`),
    channels: ['email', 'whatsapp', 'push'],
    whatsappTemplate: 'order_accepted',
  },
  order_dispatched: {
    subject: (d) => `Order ${d.orderNumber ?? ''} on the way`,
    render: (d) => wrapHtml('Out for delivery', `<p>Your order ${d.orderNumber ?? ''} is out for delivery.</p>`),
    channels: ['email', 'whatsapp', 'push'],
    whatsappTemplate: 'order_dispatched',
  },
  delivery_confirmed: {
    subject: (d) => `Order ${d.orderNumber ?? ''} delivered`,
    render: (d) => wrapHtml('Enjoy', `<p>We hope ${d.orderNumber ?? 'your order'} hit the spot.</p>`),
    channels: ['email', 'whatsapp', 'push'],
    whatsappTemplate: 'delivery_confirmed',
  },

  // ---------- Refunds ----------
  refund_issued_customer: {
    subject: (d) => `Refund of ${money(d.amountPence)} processed`,
    render: (d) => wrapHtml('Refund issued',
      `<p>We've issued a refund of <strong>${money(d.amountPence)}</strong> for order ${d.orderId ?? ''}. It should appear within 5–10 working days.</p>`),
    channels: ['email', 'push'],
  },
  refund_deducted_vendor: {
    subject: () => 'Refund deducted from upcoming payout',
    render: (d) => wrapHtml('Refund deducted',
      `<p>${money(d.deductionPence)} has been deducted from your next weekly payout (order ${d.orderId ?? ''}).</p>`),
    channels: ['email'],
  },

  // ---------- Payouts ----------
  payout_batch_ready: {
    subject: () => 'Weekly payout statement ready',
    render: (d) => wrapHtml('Payout ready',
      `<p>Your payout of <strong>${money(d.amountPence)}</strong> for week ending ${String(d.periodEnd ?? '').slice(0, 10)} is ready for review.</p>`),
    channels: ['email', 'whatsapp'],
    whatsappTemplate: 'payout_statement',
  },
  payout_held: {
    subject: () => 'Payout on hold',
    render: (d) => wrapHtml('Payout held',
      `<p>Your weekly payout has been held: ${d.holdReason ?? 'review required'}. Our team will be in touch.</p>`),
    channels: ['email'],
  },

  // ---------- Disputes ----------
  dispute_raised: {
    subject: (d) => `New dispute on order ${d.orderNumber ?? ''}`,
    render: (d) => wrapHtml('Dispute raised',
      `<p>A customer has raised a dispute (${d.issueType ?? 'issue'}) on order ${d.orderNumber ?? ''}. Please respond within 24 hours.</p>`),
    channels: ['email', 'push'],
  },
  dispute_vendor_responded: {
    subject: () => 'Vendor responded to your dispute',
    render: (d) => wrapHtml('Vendor responded',
      `<p>The vendor has responded to your dispute. Our support team is reviewing the case.</p><blockquote style="margin:12px 0;padding-left:12px;border-left:3px solid #ccc;color:#555">${d.vendorResponse ?? ''}</blockquote>`),
    channels: ['email', 'push'],
  },
  dispute_resolved: {
    subject: () => 'Your dispute has been resolved',
    render: (d) => wrapHtml('Dispute resolved',
      `<p>Resolution: <strong>${d.resolution ?? ''}</strong>.</p><p>${d.resolutionNote ?? ''}</p>`),
    channels: ['email', 'push'],
  },

  // ---------- Compliance ----------
  document_expiring: {
    subject: (d) => `${d.documentType ?? 'Document'} expires in ${d.daysUntilExpiry ?? ''} days`,
    render: (d) => wrapHtml('Document expiring',
      `<p>Your <strong>${d.documentType ?? ''}</strong> expires on ${String(d.expiresAt ?? '').slice(0, 10)}. Please upload a renewal in your vendor portal.</p>`),
    channels: ['email'],
  },
  document_expired: {
    subject: (d) => `${d.documentType ?? 'Document'} EXPIRED`,
    render: (d) => wrapHtml('Document expired',
      `<p>Vendor ${d.vendorName ?? d.vendorId ?? ''} has an expired ${d.documentType ?? 'document'} with no renewal on file.</p>`),
    channels: ['email'],
  },
  review_request: {
    subject: (d) => `How was your order from ${d.vendorName ?? 'your vendor'}?`,
    render: (d) => wrapHtml('Leave a review', `<p>Your order ${d.orderNumber ?? ''} arrived 2 hours ago — would you mind leaving a quick review?</p>`),
    channels: ['email', 'whatsapp', 'push'],
    whatsappTemplate: 'review_request',
  },
};

export function getTemplate(eventName: string): NotificationTemplate | undefined {
  return TEMPLATES[eventName];
}
