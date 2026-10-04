/**
 * Keep the single-use credential in a fragment so email scanners cannot
 * redeem it. The vendor must confirm the link before choosing a password.
 */
export function vendorInviteLink(portalUrl: string, tokenHash: string): string {
  const url = new URL('/auth/confirm', portalUrl);
  url.searchParams.set('next', '/onboarding');
  url.hash = new URLSearchParams({ token_hash: tokenHash, type: 'recovery' }).toString();
  return url.toString();
}
