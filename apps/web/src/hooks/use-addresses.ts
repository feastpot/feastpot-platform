'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createAddress, listAddresses, type CreateAddressInput } from '@/lib/api/addresses';
import { useAccessToken } from '@/lib/auth/use-access-token';

const ADDRESSES_KEY = 'addresses';

export function useAddresses() {
  const { token } = useAccessToken();
  return useQuery({
    queryKey: [ADDRESSES_KEY, 'list'],
    queryFn: () => listAddresses(token!),
    enabled: Boolean(token),
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
      void qc.invalidateQueries({ queryKey: [ADDRESSES_KEY] });
    },
  });
}
