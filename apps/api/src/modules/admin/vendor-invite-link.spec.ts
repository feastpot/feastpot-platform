import { vendorInviteLink } from './vendor-invite-link';

describe('vendor approval setup links', () => {
  it('opens password confirmation before onboarding without exposing the token to servers', () => {
    const url = new URL(vendorInviteLink('https://vendor.feastpot.co.uk/', 'test-otp-hash'));
    expect(url.pathname).toBe('/auth/confirm');
    expect(url.searchParams.get('next')).toBe('/onboarding');
    expect(url.searchParams.has('token_hash')).toBe(false);
    expect(new URLSearchParams(url.hash.slice(1)).get('type')).toBe('recovery');
    expect(new URLSearchParams(url.hash.slice(1)).get('token_hash')).toBe('test-otp-hash');
  });
});
