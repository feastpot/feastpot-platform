'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createCateringBooking,
  type CreateCateringBookingInput,
  getVendorCateringBooking,
  listVendorCateringBookings,
  sendCateringQuote,
} from '@/lib/api/catering-bookings';

const KEY = 'vendor-catering-bookings';

export function useVendorCateringBookings(accessToken: string | undefined) {
  return useQuery({
    queryKey: [KEY, 'list'],
    queryFn: () => listVendorCateringBookings(accessToken!),
    enabled: Boolean(accessToken),
  });
}

export function useVendorCateringBooking(id: string | undefined, accessToken: string | undefined) {
  return useQuery({
    queryKey: [KEY, 'one', id],
    queryFn: () => getVendorCateringBooking(id!, accessToken!),
    enabled: Boolean(id && accessToken),
  });
}

export function useCreateCateringBooking(accessToken: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCateringBookingInput) =>
      createCateringBooking(input, accessToken!),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useSendCateringQuote(id: string, accessToken: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => sendCateringQuote(id, accessToken!),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
