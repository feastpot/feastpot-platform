import { apiRequest } from './client';

/**
 * Mirrors the GET /v1/addresses response from
 * `apps/api/src/modules/addresses/addresses.service.ts`.
 */
export interface Address {
  id: string;
  userId: string;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string;
  postcode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAddressInput {
  label?: string;
  line1: string;
  line2?: string;
  city: string;
  postcode: string;
  isDefault?: boolean;
}

export type UpdateAddressInput = Partial<CreateAddressInput>;

export function listAddresses(accessToken: string): Promise<Address[]> {
  return apiRequest<Address[]>('/addresses', { accessToken });
}

export function createAddress(input: CreateAddressInput, accessToken: string): Promise<Address> {
  return apiRequest<Address>('/addresses', { method: 'POST', body: input, accessToken });
}

export function updateAddress(id: string, input: UpdateAddressInput, accessToken: string): Promise<Address> {
  return apiRequest<Address>(`/addresses/${id}`, { method: 'PATCH', body: input, accessToken });
}

export function deleteAddress(id: string, accessToken: string): Promise<{ deleted: boolean }> {
  return apiRequest<{ deleted: boolean }>(`/addresses/${id}`, { method: 'DELETE', accessToken });
}

export function setDefaultAddress(id: string, accessToken: string): Promise<Address> {
  return updateAddress(id, { isDefault: true }, accessToken);
}
