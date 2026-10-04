import { apiRequest } from './client';
import { getVendorBySlug } from './vendors';

jest.mock('./client', () => ({ apiRequest: jest.fn() }));

const request = jest.mocked(apiRequest);
const delivery = {
  types: ['local'],
  localRadiusMiles: 5,
  localFeePence: 250,
  minOrderPence: 2_000,
  freeDeliveryOverPence: null,
  postcodes: ['SE15'],
};

describe('vendor profile delivery contract', () => {
  beforeEach(() => jest.clearAllMocks());

  it('maps the real API deliveryConfig into the customer delivery model', async () => {
    request.mockResolvedValue({ id: 'vendor-fixture', deliveryConfig: delivery });
    const profile = await getVendorBySlug('test-kitchen', {
      postcode: 'SE15 4ST',
      cache: 'no-store',
    });
    expect(profile.delivery).toEqual(delivery);
    expect(request).toHaveBeenCalledWith('/vendors/test-kitchen', {
      cache: 'no-store',
      query: { postcode: 'SE15 4ST' },
    });
  });

  it('does not replace an authoritative null with a stale delivery value', async () => {
    request.mockResolvedValue({ deliveryConfig: null, delivery });
    expect((await getVendorBySlug('test-kitchen')).delivery).toBeNull();
  });

  it('preserves existing delivery-shaped responses', async () => {
    request.mockResolvedValue({ delivery });
    expect((await getVendorBySlug('test-kitchen')).delivery).toEqual(delivery);
  });

  it('does not invent delivery pricing when neither field is present', async () => {
    request.mockResolvedValue({ id: 'vendor-fixture' });
    expect((await getVendorBySlug('test-kitchen')).delivery).toBeUndefined();
  });
});
