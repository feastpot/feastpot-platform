import { apiRequest } from './client';

export type CateringBookingStatus =
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
