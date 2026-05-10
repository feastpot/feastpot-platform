'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getVendorEventEnquiry,
  listVendorEventEnquiries,
  submitVendorQuote,
  type SubmitQuoteInput,
} from '@/lib/api/event-enquiries';

const KEY = 'vendor-event-enquiries';

export function useVendorEventEnquiries(accessToken: string | undefined) {
  return useQuery({
    queryKey: [KEY, 'list'],
    queryFn: () => listVendorEventEnquiries(accessToken!),
    enabled: Boolean(accessToken),
  });
}

export function useVendorEventEnquiry(id: string | undefined, accessToken: string | undefined) {
  return useQuery({
    queryKey: [KEY, 'one', id],
    queryFn: () => getVendorEventEnquiry(id!, accessToken!),
    enabled: Boolean(id && accessToken),
  });
}

export function useSubmitVendorQuote(enquiryId: string, accessToken: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitQuoteInput) => submitVendorQuote(enquiryId, input, accessToken!),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
