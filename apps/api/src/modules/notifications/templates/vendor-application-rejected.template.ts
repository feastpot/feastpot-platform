import { baseLayout, escapeHtml, h2, p } from './base-layout';

export interface VendorApplicationRejectedData {
  firstName: string;
  kitchenName: string;
  reason: string;
  supportEmail?: string;
}

/**
 * Sent when an admin rejects a VendorApplication. The `reason` is admin-
 * authored and surfaced to the applicant verbatim - admins must write it
 * with that in mind. Tone is supportive: many rejections are "not yet"
 * (e.g. waiting on FSA registration) rather than "no, ever".
 */
export function vendorApplicationRejectedTemplate(
  data: VendorApplicationRejectedData,
): { subject: string; html: string } {
  const firstName = escapeHtml(data.firstName);
  const kitchenName = escapeHtml(data.kitchenName);
  const reason = escapeHtml(data.reason);
  const support = data.supportEmail ?? 'hello@feastpot.co.uk';

  const reasonBlock = `
    <div style="margin:16px 0;padding:16px;background:#FBF7F2;border-left:4px solid #E8520A;border-radius:4px;font-size:15px;color:#3A3934;line-height:1.6;white-space:pre-wrap">${reason}</div>
  `;

  return {
    subject: `An update on your Feastpot application`,
    html: baseLayout(
      'Application update',
      h2(`Hi ${firstName}`) +
        p(
          `Thanks for applying to bring <strong>${kitchenName}</strong> to Feastpot. After reviewing your application, we're unable to approve it at this time.`,
        ) +
        h2(`Here's what our team noted`) +
        reasonBlock +
        p(
          `If anything in our note can be addressed (for example, an FSA registration or updated food story), we'd genuinely love to see you reapply. Just reply to this email when you're ready.`,
        ) +
        p(
          `Questions? Reach us at <a href="mailto:${escapeHtml(support)}" style="color:#E8520A">${escapeHtml(support)}</a>. We reply within 1 business day.`,
          '#888780',
        ),
      `An update on your Feastpot application for ${kitchenName}`,
    ),
  };
}
