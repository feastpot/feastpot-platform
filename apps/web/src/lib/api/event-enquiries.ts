import { apiRequest } from './client';

export type EnquiryStatus = 'open' | 'quoted' | 'confirmed' | 'completed' | 'cancelled';
export type QuoteStatus = 'submitted' | 'accepted' | 'rejected' | 'expired';

export interface EventQuote {
  id: string;
  enquiryId: string;
  vendorId: string;
  pricePence: number;
  perHeadPence: number;
  deliveryFeePence: number;
  minDepositPct: number;
  proposedMenu: string | null;
  terms: string | null;
  status: QuoteStatus;
  expiresAt: string | null;
  createdAt: string;
  vendor?: { id: string; businessName: string; slug: string; rating: number; ratingCount?: number };
}

export interface EventEnquiry {
  id: string;
  customerId: string;
  eventType: string;
  guestCount: number;
  finalGuestCount: number | null;
  eventDate: string;
  postcode: string;
  budgetPence: number | null;
  cuisines: string[];
  dietary: string[];
  notes: string | null;
  menuAdjustments: string | null;
  status: EnquiryStatus;
  vendorId: string | null;
  matchedVendorIds: string[];
  quoteDeadline: string | null;
  depositPiId: string | null;
  balancePiId: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  quotes?: EventQuote[];
  selectedVendor?: { id: string; businessName: string; slug: string } | null;
}

export interface CreateEventEnquiryInput {
  eventType: string;
  guestCount: number;
  eventDate: string;
  postcode: string;
  budgetPence?: number;
  cuisines: string[];
  dietary?: string[];
  notes?: string;
}

export function listEventEnquiries(
  params: { status?: EnquiryStatus } = {},
  accessToken: string,
): Promise<EventEnquiry[]> {
  return apiRequest<EventEnquiry[]>('/event-enquiries', { query: params, accessToken });
}

export function getEventEnquiry(id: string, accessToken: string): Promise<EventEnquiry> {
  return apiRequest<EventEnquiry>(`/event-enquiries/${id}`, { accessToken });
}

export function createEventEnquiry(input: CreateEventEnquiryInput, accessToken: string): Promise<EventEnquiry> {
  return apiRequest<EventEnquiry>('/event-enquiries', { method: 'POST', body: input, accessToken });
}

export interface SelectVendorResult {
  enquiry: EventEnquiry;
  clientSecret: string;
  depositPence: number;
}

export function selectVendor(
  enquiryId: string,
  vendorId: string,
  accessToken: string,
): Promise<SelectVendorResult> {
  return apiRequest<SelectVendorResult>(`/event-enquiries/${enquiryId}/select-vendor`, {
    method: 'POST',
    body: { vendorId },
    accessToken,
  });
}

export function confirmDeposit(enquiryId: string, accessToken: string): Promise<EventEnquiry> {
  return apiRequest<EventEnquiry>(`/event-enquiries/${enquiryId}/confirm-deposit`, {
    method: 'POST',
    accessToken,
  });
}

export function confirmNumbers(
  enquiryId: string,
  body: { guestCount: number; menuAdjustments?: string },
  accessToken: string,
): Promise<EventEnquiry> {
  return apiRequest<EventEnquiry>(`/event-enquiries/${enquiryId}/confirm-numbers`, {
    method: 'PATCH',
    body,
    accessToken,
  });
}
