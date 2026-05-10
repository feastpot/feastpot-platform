'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

export type DeliveryType = 'local' | 'collection' | 'nationwide';

export interface DeliveryConfig {
  id: string;
  vendorId: string;
  types: DeliveryType[];
  localRadiusMiles: number;
  localFeePence: number;
  collectionAddress: string | null;
  nationwideEnabled: boolean;
  nationwideFeePence: number;
  minOrderPence: number;
  freeDeliveryOverPence: number | null;
  postcodes: string[];
}

export interface UpsertDeliveryConfigInput {
  types: DeliveryType[];
  localRadiusMiles?: number;
  localFeePence?: number;
  collectionAddress?: string;
  nationwideEnabled?: boolean;
  nationwideFeePence?: number;
  minOrderPence?: number;
  freeDeliveryOverPence?: number | null;
  postcodes?: string[];
}

const KEY = ['vendor', 'delivery-config'] as const;

export function useDeliveryConfig() {
  const { token, loading } = useAccessToken();
  return useQuery({
    queryKey: KEY,
    enabled: !!token && !loading,
    queryFn: () =>
      apiRequest<DeliveryConfig | null>('/vendors/me/delivery-config', { accessToken: token! }),
  });
}

export function useUpsertDeliveryConfig() {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertDeliveryConfigInput) =>
      apiRequest<DeliveryConfig>('/vendors/me/delivery-config', {
        method: 'PUT',
        accessToken: token!,
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
