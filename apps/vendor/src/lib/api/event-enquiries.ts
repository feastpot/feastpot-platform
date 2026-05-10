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
}

export interface EventEnquiry {
  id: string;
  eventType: string;
  guestCount: number;
  eventDate: string;
  postcode: string;
  budgetPence: number | null;
  cuisines: string[];
  dietary: string[];
  notes: string | null;
  status: EnquiryStatus;
  matchedVendorIds: string[];
  quoteDeadline: string | null;
  vendorId: string | null;
  createdAt: string;
  quotes?: EventQuote[];
}

export interface SubmitQuoteInput {
  proposedMenu: string;
  perHeadPence: number;
  deliveryFeePence: number;
  minDepositPct: number;
  terms?: string;
  expiresAt: string;
}

export function listVendorEventEnquiries(accessToken: string): Promise<EventEnquiry[]> {
  return apiRequest<EventEnquiry[]>('/event-enquiries', { accessToken });
}

export function getVendorEventEnquiry(id: string, accessToken: string): Promise<EventEnquiry> {
  return apiRequest<EventEnquiry>(`/event-enquiries/${id}`, { accessToken });
}

export function submitVendorQuote(
  enquiryId: string,
  input: SubmitQuoteInput,
  accessToken: string,
): Promise<EventQuote> {
  return apiRequest<EventQuote>(`/event-enquiries/${enquiryId}/quotes`, {
    method: 'POST',
    body: input,
    accessToken,
  });
}
