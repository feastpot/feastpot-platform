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

export interface EnquiryListResponse {
  data: EnquiryRow[];
  total: number;
  nextCursor: string | null;
}

export interface EnquiryListFilters {
  status?: EnquiryStatus | 'all';
  q?: string;
  eventFrom?: string;
  eventTo?: string;
  createdFrom?: string;
  createdTo?: string;
  budgetMin?: number;
  budgetMax?: number;
  cursor?: string | null;
  limit?: number;
}

/**
 * Admin-scoped paginated list. Backed by GET /v1/event-enquiries (admin
 * branch returns {data,total,nextCursor}; customer/vendor still get an
 * array). Filters beyond `status` only apply to admin/support callers
 * — silently ignored elsewhere so we can never widen visibility via a
 * stray filter param.
 */
export function useEventEnquiries(filters: EnquiryListFilters) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'event-enquiries', filters],
    enabled: ready,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status && filters.status !== 'all') params.set('status', filters.status);
      if (filters.q?.trim()) params.set('q', filters.q.trim());
      if (filters.eventFrom) params.set('eventFrom', filters.eventFrom);
      if (filters.eventTo) params.set('eventTo', filters.eventTo);
      if (filters.createdFrom) params.set('createdFrom', filters.createdFrom);
      if (filters.createdTo) params.set('createdTo', filters.createdTo);
      if (filters.budgetMin !== undefined) params.set('budgetMin', String(filters.budgetMin));
      if (filters.budgetMax !== undefined) params.set('budgetMax', String(filters.budgetMax));
      if (filters.cursor) params.set('cursor', filters.cursor);
      params.set('limit', String(filters.limit ?? 25));
      return request<EnquiryListResponse>(`/event-enquiries?${params.toString()}`);
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
