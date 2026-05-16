import { baseLayout, escapeHtml, h2, p } from './base-layout';

export interface VendorApplicationInfoRequestedData {
  firstName: string;
  kitchenName: string;
  /** Free-form ask from the admin — surfaced verbatim to the applicant. */
  question: string;
  supportEmail?: string;
}

/**
 * Sent when an admin sets a VendorApplication to status=information_requested.
 * The `question` field is the admin's adminNotes content, written with the
 * knowledge that the applicant will read it directly. The applicant is asked
 * to reply to the support inbox; the admin then re-reviews based on the
 * answer (no inbound webhook needed for v1).
 */
export function vendorApplicationInfoRequestedTemplate(
  data: VendorApplicationInfoRequestedData,
): { subject: string; html: string } {
  const firstName = escapeHtml(data.firstName);
  const kitchenName = escapeHtml(data.kitchenName);
  const question = escapeHtml(data.question);
  const support = data.supportEmail ?? 'hello@feastpot.co.uk';

  const questionBlock = `
    <div style="margin:16px 0;padding:16px;background:#F0F7FB;border-left:4px solid #185FA5;border-radius:4px;font-size:15px;color:#3A3934;line-height:1.6;white-space:pre-wrap">${question}</div>
  `;

  return {
    subject: `A quick question about your Feastpot application`,
    html: baseLayout(
      'We have a question',
      h2(`Hi ${firstName}`) +
        p(
          `Thanks for applying with <strong>${kitchenName}</strong>! Before we can finish reviewing, our team has a question:`,
        ) +
        questionBlock +
        p(
          `Just reply to this email — or write to <a href="mailto:${escapeHtml(support)}" style="color:#E8520A">${escapeHtml(support)}</a> — and we'll pick up your application as soon as we hear back.`,
        ) +
        p(`We typically respond within 1 business day.`, '#888780'),
      `A quick question about your application for ${kitchenName}`,
    ),
  };
}
