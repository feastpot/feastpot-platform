import { baseLayout, brandButton, escapeHtml, h2, p } from './base-layout';

export interface VendorPortalInviteData {
  firstName: string;
  kitchenName: string;
  magicLinkUrl: string;
  /** Display-only countdown; the real expiry is controlled by Supabase. */
  expiresInDays?: number;
  supportEmail?: string;
}

/**
 * Sent the moment an admin approves a VendorApplication and the system
 * provisions the Supabase auth user. Contains a Supabase magic link that
 * lets the vendor set their password and access the vendor portal for the
 * first time.
 *
 * IMPORTANT: this is distinct from a generic "vendor approved" email - it
 * MUST contain the magic link, otherwise the vendor has no way in.
 */
export function vendorPortalInviteTemplate(data: VendorPortalInviteData): {
  subject: string;
  html: string;
} {
  const firstName = escapeHtml(data.firstName);
  const kitchenName = escapeHtml(data.kitchenName);
  const expiresInDays = data.expiresInDays ?? 7;
  const support = data.supportEmail ?? 'hello@feastpot.co.uk';

  const stepsHtml = `
    <ol style="margin:8px 0 16px 20px;padding:0;font-size:15px;color:#5F5E5A;line-height:1.7">
      <li><strong>Click the button below</strong> to set your password and sign in.</li>
      <li><strong>Complete your menu</strong> - dishes, prices, allergens, photos.</li>
      <li><strong>Connect Stripe</strong> so we can pay out your earnings.</li>
      <li><strong>Go live</strong> - we'll review your menu and switch you on.</li>
    </ol>
  `;

  return {
    subject: `You're in - welcome to Feastpot, ${data.firstName}!`,
    html: baseLayout(
      'Welcome to Feastpot',
      h2(`Congratulations, ${firstName}!`) +
        p(
          `<strong>${kitchenName}</strong> has been approved to join Feastpot. We're excited to have you cooking with us.`,
        ) +
        h2('Set up your vendor account') +
        p(
          `Click the button below to set your password and access your vendor portal. <strong>This link expires in ${expiresInDays} days</strong> - if it lapses, reply to this email and we'll send a fresh one.`,
        ) +
        brandButton('Set my password & sign in', data.magicLinkUrl, 'vendorBlue') +
        h2('What happens next') +
        stepsHtml +
        p(
          `Need a hand? Email <a href="mailto:${escapeHtml(support)}" style="color:#E8520A">${escapeHtml(support)}</a> - we typically reply within 1 business day.`,
          '#888780',
        ),
      `Welcome ${firstName} - set your password to access your vendor portal`,
    ),
  };
}
