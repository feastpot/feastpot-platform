'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createAddress,
  deleteAddress,
  listAddresses,
  setDefaultAddress,
  updateAddress,
  type Address,
  type CreateAddressInput,
  type UpdateAddressInput,
} from '@/lib/api/addresses';
import { useAccessToken } from '@/lib/auth/use-access-token';

const ADDRESSES_KEY = ['addresses'] as const;

/**
 * Saved-addresses TanStack Query hooks.
 *
 * - 5 min stale time: addresses change infrequently and the checkout page
 *   re-uses the cache rather than re-fetching for every step.
 * - Every mutation invalidates the list so the UI reflects creates,
 *   updates, default-flips and deletes without a page reload.
 */

export function useAddresses() {
  const { token } = useAccessToken();
  return useQuery<Address[]>({
    queryKey: [...ADDRESSES_KEY, 'list'],
    queryFn: () => listAddresses(token!),
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
  });
}

export function useCreateAddress() {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAddressInput) => {
      if (!token) throw new Error('Not signed in');
      return createAddress(input, token);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ADDRESSES_KEY });
    },
  });
}

export function useUpdateAddress() {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAddressInput }) => {
      if (!token) throw new Error('Not signed in');
      return updateAddress(id, input, token);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ADDRESSES_KEY });
    },
  });
}

export function useDeleteAddress() {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      if (!token) throw new Error('Not signed in');
      return deleteAddress(id, token);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ADDRESSES_KEY });
    },
  });
}

export function useSetDefaultAddress() {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      if (!token) throw new Error('Not signed in');
      return setDefaultAddress(id, token);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ADDRESSES_KEY });
    },
  });
}
