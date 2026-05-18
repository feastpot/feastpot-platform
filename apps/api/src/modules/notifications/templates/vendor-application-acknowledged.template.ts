import { baseLayout, brandButton, escapeHtml, h2, p } from './base-layout';

export interface VendorApplicationAcknowledgedData {
  firstName: string;
  kitchenName: string;
  supportEmail?: string;
}

/**
 * Customer-facing acknowledgement sent to the applicant immediately after
 * they submit the become-a-vendor form. Reinforces the 1-2 business day SLA
 * and gives them productive things to do while they wait.
 */
export function vendorApplicationAcknowledgedTemplate(
  data: VendorApplicationAcknowledgedData,
): { subject: string; html: string } {
  const support = data.supportEmail ?? 'hello@feastpot.co.uk';
  const firstName = escapeHtml(data.firstName);
  const kitchenName = escapeHtml(data.kitchenName);

  const stepsHtml = `
    <ol style="margin:8px 0 16px 20px;padding:0;font-size:15px;color:#5F5E5A;line-height:1.7">
      <li><strong>We review your application</strong> - 1 to 2 business days.</li>
      <li><strong>We email you the outcome</strong> - approved, declined, or with a question.</li>
      <li><strong>If approved:</strong> menu setup, Stripe payouts, and your kitchen goes live.</li>
    </ol>
  `;

  const tipsHtml = `
    <ul style="margin:8px 0 16px 20px;padding:0;font-size:15px;color:#5F5E5A;line-height:1.7">
      <li>Draft your menu list (dishes, prices, allergens).</li>
      <li>Gather your FSA / food hygiene documents.</li>
      <li>Take a few clear photos of your signature dishes.</li>
    </ul>
  `;

  return {
    subject: `We've received your Feastpot application, ${data.firstName}!`,
    html: baseLayout(
      'Application received',
      h2(`Thanks, ${firstName} - we've got it`) +
        p(
          `Your application for <strong>${kitchenName}</strong> is in, and our team will be in touch shortly.`,
        ) +
        h2('What happens next') +
        stepsHtml +
        h2('While you wait') +
        tipsHtml +
        brandButton('Visit Feastpot', 'https://feastpot.co.uk', 'vendorBlue') +
        p(
          `Any questions in the meantime? Email <a href="mailto:${escapeHtml(support)}" style="color:#E8520A">${escapeHtml(support)}</a> - we reply within 1 business day.`,
          '#888780',
        ),
      `Thanks ${firstName} - we'll review your kitchen within 1-2 business days`,
    ),
  };
}
