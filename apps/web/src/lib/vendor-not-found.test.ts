import { isMissingVendorProfile } from './vendor-not-found';

describe('vendor 404 before streamed rendering', () => {
  it('identifies a definite missing vendor and encodes the slug once', async () => {
    const fetcher = jest.fn().mockResolvedValue(new Response(null, { status: 404 }));
    await expect(
      isMissingVendorProfile('/vendors/audit-missing-slug', 'https://api.example', fetcher),
    ).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example/v1/vendors/audit-missing-slug',
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
    );
  });

  it.each([200, 403, 429, 500, 503])('does not turn API %s into a missing page', async (status) => {
    const fetcher = jest.fn().mockResolvedValue(new Response(null, { status }));
    await expect(
      isMissingVendorProfile('/vendors/kitchen', 'https://api.example', fetcher),
    ).resolves.toBe(false);
  });

  it('does not hide a network error as a vendor 404', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('network'));
    await expect(
      isMissingVendorProfile('/vendors/kitchen', 'https://api.example', fetcher),
    ).resolves.toBe(false);
  });

  it.each(['/vendors', '/vendors/kitchen/menu', '/orders', '/vendors/%ZZ'])(
    'leaves other and malformed paths alone: %s',
    async (path) => {
      const fetcher = jest.fn();
      await expect(isMissingVendorProfile(path, 'https://api.example', fetcher)).resolves.toBe(
        false,
      );
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
});
