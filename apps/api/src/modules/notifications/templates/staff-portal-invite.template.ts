import { baseLayout, brandButton, escapeHtml, h2, p } from './base-layout';

export interface StaffPortalInviteData {
  firstName: string;
  /** Human-readable role label, e.g. "Admin", "Finance". */
  roleLabel: string;
  magicLinkUrl: string;
  /** Display-only countdown; the real expiry is controlled by Supabase. */
  expiresInDays?: number;
  supportEmail?: string;
}

/**
 * Sent by an admin from /users → Add user. Mirrors the vendor portal
 * invite but targets the admin console rather than the vendor portal,
 * and explicitly names the role the user is being granted so a
 * recipient who wasn't expecting it can flag it before clicking.
 */
export function staffPortalInviteTemplate(data: StaffPortalInviteData): {
  subject: string;
  html: string;
} {
  const firstName = escapeHtml(data.firstName);
  const roleLabel = escapeHtml(data.roleLabel);
  const expiresInDays = data.expiresInDays ?? 7;
  const support = data.supportEmail ?? 'info@feastpot.co.uk';

  return {
    subject: `You've been invited to the Feastpot admin console (${data.roleLabel})`,
    html: baseLayout(
      'Feastpot admin invite',
      h2(`Welcome, ${firstName}.`) +
        p(
          `You've been invited to the Feastpot admin console as <strong>${roleLabel}</strong>. Click the button below to set your password and sign in. <strong>This link expires in ${expiresInDays} days.</strong>`,
        ) +
        brandButton('Set my password & sign in', data.magicLinkUrl, 'green') +
        h2('Wasn\u2019t expecting this?') +
        p(
          `If you don\u2019t recognise this invite, ignore the email and let us know at <a href="mailto:${escapeHtml(support)}" style="color:#00843D">${escapeHtml(support)}</a>. The link is single-use and expires automatically.`,
          '#888780',
        ),
      `${firstName} — set your password to access the Feastpot admin console.`,
    ),
  };
}
