import { apiRequest, ApiError } from './client';

export interface Address {
  id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string;
  postcode: string;
  country: string;
  isDefault: boolean;
}

export interface CreateAddressInput {
  label?: string;
  line1: string;
  line2?: string;
  city: string;
  postcode: string;
  country?: string;
}

/**
 * BACKEND GAP: there is no AddressesController in apps/api today. These calls
 * target the conventional `/v1/users/me/addresses` path and fail-fast with
 * `ApiError` (status 404) when the endpoint is not yet implemented. The
 * checkout page treats a 404 as "no saved addresses" and lets the customer
 * proceed by entering one inline (the order-create endpoint already accepts
 * an optional `deliveryAddressId`, so omitting it is valid).
 */
export async function listAddresses(accessToken: string): Promise<Address[]> {
  try {
    const r = await apiRequest<{ data: Address[] } | Address[]>('/users/me/addresses', { accessToken });
    return Array.isArray(r) ? r : r.data;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return [];
    throw e;
  }
}

export async function createAddress(
  input: CreateAddressInput,
  accessToken: string,
): Promise<Address | null> {
  try {
    return await apiRequest<Address>('/users/me/addresses', {
      method: 'POST',
      body: input,
      accessToken,
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
