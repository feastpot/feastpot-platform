import { apiRequest } from './client';

export type CateringBookingStatus =
  | 'ASSIGNED'
  | 'QUOTED'
  | 'DEPOSIT_PAID'
  | 'CONFIRMED'
  | 'BALANCE_PAID'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface CateringLineItemInput {
  description: string;
  quantity: number;
  unitPence: number;
  allergens: string[];
}

export interface CateringLineItem extends CateringLineItemInput {
  id: string;
  bookingId: string;
}

export interface CateringBooking {
  id: string;
  enquiryId: string;
  vendorId: string;
  customerEmail: string;
  customerName: string;
  eventDate: string;
  guestCount: number;
  eventAddress: string | null;
  preferredTime: string | null;
  totalPence: number;
  minimumDepositPence: number;
  depositPence: number;
  balancePence: number;
  commissionPercent: string;
  commissionPence: number;
  attributionSource: string | null;
  status: CateringBookingStatus;
  quoteExpiresAt: string;
  depositPaidAt: string | null;
  balancePaidAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  lineItems?: CateringLineItem[];
}

export interface CreateCateringBookingInput {
  enquiryId: string;
  eventDate?: string;
  guestCount?: number;
  eventAddress?: string;
  preferredTime?: string;
  lineItems: CateringLineItemInput[];
  minimumDepositPence: number;
  quoteExpiresAt?: string;
}

export function listVendorCateringBookings(accessToken: string): Promise<CateringBooking[]> {
  return apiRequest<CateringBooking[]>('/catering-bookings/mine', { accessToken });
}

export function getVendorCateringBooking(
  id: string,
  accessToken: string,
): Promise<CateringBooking> {
  return apiRequest<CateringBooking>(`/catering-bookings/${id}`, { accessToken });
}

export function createCateringBooking(
  input: CreateCateringBookingInput,
  accessToken: string,
): Promise<CateringBooking> {
  return apiRequest<CateringBooking>('/catering-bookings', {
    method: 'POST',
    body: input,
    accessToken,
  });
}

export function sendCateringQuote(id: string, accessToken: string): Promise<{ sent: true }> {
  return apiRequest<{ sent: true }>(`/catering-bookings/${id}/send-quote`, {
    method: 'POST',
    accessToken,
  });
}

export interface FillCateringQuoteInput {
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPence: number;
    allergens?: string[];
  }>;
  eventDate?: string;
  guestCount?: number;
  eventAddress?: string;
  preferredTime?: string;
  minimumDepositPence: number;
  quoteExpiresAt?: string;
}

export function fillCateringQuote(
  id: string,
  input: FillCateringQuoteInput,
  accessToken: string,
): Promise<CateringBooking> {
  return apiRequest<CateringBooking>(`/catering-bookings/${id}/fill-quote`, {
    method: 'POST',
    body: input,
    accessToken,
  });
}

export function declineCateringBooking(
  id: string,
  reason: string | undefined,
  accessToken: string,
): Promise<{ declined: true }> {
  return apiRequest<{ declined: true }>(`/catering-bookings/${id}/decline`, {
    method: 'POST',
    body: { reason },
    accessToken,
  });
}
