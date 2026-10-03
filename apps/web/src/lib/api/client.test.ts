import { ApiError, apiRequest } from './client';
import { userErrorMessage } from '@/lib/user-error-message';

jest.mock('@/lib/env', () => ({ API_URL: 'https://api.example' }));
jest.mock('@/lib/user-error-message', () => ({
  userErrorMessage: Object.assign(
    jest.fn(async () => 'Please try again.'),
    {
      acknowledge: jest.fn(),
      acknowledgeResponse: jest.fn(),
    },
  ),
}));

describe('API client registration and upload requests', () => {
  let fetcher: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    fetcher = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetcher.mockRestore();
  });

  it('preserves acquisition headers while enforcing authenticated JSON headers', async () => {
    const result = { id: 'draft-fixture' };
    fetcher.mockResolvedValue(Response.json(result));
    await expect(
      apiRequest('/vendors/application-drafts', {
        method: 'POST',
        accessToken: 'fixture-token',
        body: { businessName: 'Test kitchen' },
        headers: {
          'X-Fp-Anon': 'anon-fixture',
          'X-Fp-Sid': 'session-fixture',
          'X-Fp-Ref': 'referral-fixture',
          Accept: 'text/html',
          Authorization: 'incorrect',
          'Content-Type': 'text/plain',
        },
      }),
    ).resolves.toEqual(result);
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example/v1/vendors/application-drafts',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'X-Fp-Anon': 'anon-fixture',
          'X-Fp-Sid': 'session-fixture',
          'X-Fp-Ref': 'referral-fixture',
          Accept: 'application/json',
          Authorization: 'Bearer fixture-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ businessName: 'Test kitchen' }),
      }),
    );
    expect(userErrorMessage.acknowledgeResponse).toHaveBeenCalledWith(result);
  });

  it('encodes array, zero and false query values and omits empty values', async () => {
    fetcher.mockResolvedValue(Response.json([]));
    await apiRequest('/vendors', {
      query: { cuisines: ['a', 'b'], page: 0, open: false, empty: '', missing: null, none: [] },
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example/v1/vendors?cuisines=a%2Cb&page=0&open=false',
      expect.objectContaining({ method: 'GET', body: undefined }),
    );
  });

  it('leaves multipart boundaries to fetch and handles a bodyless upload response', async () => {
    const body = new FormData();
    body.append('file', new Blob(['image-fixture'], { type: 'image/png' }), 'photo.png');
    fetcher.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(
      apiRequest('/vendors/application-drafts/photo', { method: 'POST', body }),
    ).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example/v1/vendors/application-drafts/photo',
      expect.objectContaining({ body, headers: { Accept: 'application/json' } }),
    );
  });

  it('preserves API error codes and acknowledges the reference before displaying a safe error', async () => {
    const body = { code: 'DRAFT_EXPIRED', message: 'Internal detail', ref: 'reference-fixture' };
    fetcher.mockResolvedValue(Response.json(body, { status: 410 }));
    const error = await apiRequest('/vendors/application-drafts/resume').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 410,
      code: 'DRAFT_EXPIRED',
      message: 'Please try again.',
      body,
    });
    expect(userErrorMessage.acknowledge).toHaveBeenCalledWith(error, 'reference-fixture');
    expect(userErrorMessage).toHaveBeenCalledWith(error);
  });
});
