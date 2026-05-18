'use client';

import { useQuery } from '@tanstack/react-query';

import { useApi } from './use-api';

export type EnquiryStatus = 'open' | 'quoted' | 'confirmed' | 'completed' | 'cancelled' | 'expired';

export interface EnquiryQuoteRow {
  id: string;
  vendorId: string;
  totalPence: number | null;
  status: string;
  vendor: { id: string; businessName: string; slug: string; rating: number | null };
}

export interface EnquiryRow {
  id: string;
  eventType: string;
  guestCount: number;
  finalGuestCount: number | null;
  eventDate: string;
  postcode: string;
  budgetPence: number | null;
  cuisines: string[];
  dietary: string[];
  status: EnquiryStatus;
  vendorId: string | null;
  matchedVendorIds: string[];
  quoteDeadline: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
  selectedVendor: { id: string; businessName: string; slug: string } | null;
  quotes: EnquiryQuoteRow[];
}

export function useEventEnquiries(filter: { status?: EnquiryStatus }) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'event-enquiries', filter],
    enabled: ready,
    refetchInterval: 60_000,
    queryFn: () => {
      const params = new URLSearchParams();
      if (filter.status) params.set('status', filter.status);
      const qs = params.toString();
      return request<EnquiryRow[]>(`/event-enquiries${qs ? `?${qs}` : ''}`);
    },
  });
}

/**
 * D17: single-enquiry fetch for the detail page. Hits the existing
 * GET /v1/event-enquiries/:id which is already admin-aware (see
 * EventEnquiriesService.getById - role=admin returns the full row
 * with all quotes unfiltered). No new admin-prefixed endpoint needed.
 */
export function useEventEnquiry(id: string | undefined) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'event-enquiry', id],
    enabled: ready && !!id,
    queryFn: () => request<EnquiryRow>(`/event-enquiries/${id}`),
  });
}
