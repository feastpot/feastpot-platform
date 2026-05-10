'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAccessToken } from '@/lib/auth/use-access-token';
import {
  confirmDeposit,
  confirmNumbers,
  createEventEnquiry,
  getEventEnquiry,
  listEventEnquiries,
  selectVendor,
  type CreateEventEnquiryInput,
  type EnquiryStatus,
} from '@/lib/api/event-enquiries';

const KEY = 'event-enquiries';

export function useEventEnquiries(params: { status?: EnquiryStatus } = {}) {
  const { token } = useAccessToken();
  return useQuery({
    queryKey: [KEY, 'list', params],
    queryFn: () => listEventEnquiries(params, token!),
    enabled: Boolean(token),
  });
}

export function useEventEnquiry(id: string | undefined) {
  const { token } = useAccessToken();
  return useQuery({
    queryKey: [KEY, 'one', id],
    queryFn: () => getEventEnquiry(id!, token!),
    enabled: Boolean(token && id),
    refetchInterval: 30_000,
  });
}

export function useCreateEventEnquiry() {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEventEnquiryInput) => createEventEnquiry(input, token!),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useSelectVendor(enquiryId: string) {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vendorId: string) => selectVendor(enquiryId, vendorId, token!),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useConfirmDeposit(enquiryId: string) {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => confirmDeposit(enquiryId, token!),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useConfirmNumbers(enquiryId: string) {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { guestCount: number; menuAdjustments?: string }) =>
      confirmNumbers(enquiryId, body, token!),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
