import { apiRequest, type ApiRequestOptions } from './client';

/**
 * The order subset the customer-facing UI uses. The API returns the full
 * Prisma `Order` with related rows; we only narrow the shape here so the UI
 * has type-safe access to the fields it actually reads.
 */
export type OrderStatus =
  | 'pending'
  | 'cancellation_pending'
  | 'accepted'
  | 'needs_clarification'
  | 'preparing'
  | 'ready'
  | 'dispatched'
  | 'delivered'
  | 'cancelled'
  | 'rejected'
  | 'refunded'
  | 'partially_refunded';

export interface OrderItem {
  id: string;
  menuItemId: string;
  nameSnapshot: string;
  quantity: number;
  unitPence: number;
  totalPence: number;
  notes: string | null;
}

export interface OrderVendorSummary {
  id: string;
  businessName: string;
  slug: string;
  logoUrl?: string | null;
  user?: { phone?: string | null } | null;
}

export interface OrderAmendment {
  id: string;
  proposedChange: string;
  priceDeltaPence: number;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  expiresAt: string;
  createdAt: string;
}

export interface OrderDispute {
  id: string;
  status: 'open' | 'vendor_contacted' | 'escalated' | 'resolved';
  issueType: string;
  severity: string;
  description: string;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  vendorId: string;
  status: OrderStatus;
  subtotalPence: number;
  deliveryFeePence: number;
  serviceFeePence: number;
  discountPence: number;
  totalPence: number;
  notes: string | null;
  scheduledFor: string | null;
  acceptedAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  /** Vendor-provided ETA in minutes from dispatch. Null until dispatched. */
  etaMinutes: number | null;
  /** Absolute ETA wall-clock - preferred over etaMinutes for display. */
  etaAt: string | null;
  createdAt: string;
  items?: OrderItem[];
  vendor?: OrderVendorSummary;
  /** Server returns only pending amendments. */
  amendments?: OrderAmendment[];
  /** Server returns unresolved customer disputes for tracking. */
  disputes?: OrderDispute[];
}

export function respondToAmendment(
  orderId: string,
  accepted: boolean,
  accessToken: string,
): Promise<OrderAmendment> {
  return apiRequest<OrderAmendment>(`/orders/${orderId}/amendment`, {
    method: 'PATCH',
    body: { accepted },
    accessToken,
  });
}

export interface CreateOrderInput {
  vendorId: string;
  items: { menuItemId: string; quantity: number; customisationNotes?: string }[];
  deliveryAddressId?: string;
  scheduledFor: string; // ISO 8601
  notes?: string;
  discountCode?: string;
  /** Loyalty points to redeem at checkout (min 200, 1pt = 1p discount). */
  loyaltyPointsToRedeem?: number;
  /** Customer has confirmed they have reviewed allergen information. Stored for audit. */
  allergenConfirmed?: boolean;
}

export interface CreateOrderResult {
  order: Order;
  /** Stripe PaymentIntent client secret - pass to `stripe.confirmCardPayment`. */
  clientSecret: string;
}

export function createOrder(
  input: CreateOrderInput,
  accessToken: string,
  /** Optional attribution headers (x-fp-ref, x-fp-sid, x-fp-mktplace). */
  extraHeaders?: Record<string, string>,
): Promise<CreateOrderResult> {
  return apiRequest<CreateOrderResult>('/orders', {
    method: 'POST',
    body: input,
    accessToken,
    headers: extraHeaders,
  });
}

export function confirmOrder(
  orderId: string,
  accessToken: string,
): Promise<{ confirmed: boolean; orderId: string }> {
  return apiRequest(`/orders/${orderId}/confirm`, {
    method: 'POST',
    accessToken,
  });
}

export function getOrder(
  orderId: string,
  accessToken: string,
  options?: Pick<ApiRequestOptions, 'signal'>,
): Promise<Order> {
  return apiRequest<Order>(`/orders/${orderId}`, { accessToken, ...options });
}

export interface ListOrdersResponse {
  data: Order[];
  nextCursor: string | null;
}

export function listOrders(
  params: { status?: OrderStatus; cursor?: string; limit?: number },
  accessToken: string,
  options?: Pick<ApiRequestOptions, 'signal'>,
): Promise<ListOrdersResponse> {
  return apiRequest<ListOrdersResponse>('/orders', {
    query: { ...params },
    accessToken,
    ...options,
  });
}

export interface ReorderInput {
  scheduledFor: string;
  deliveryAddressId?: string;
  notes?: string;
}

/** Returns the same `{ order, clientSecret }` shape as `createOrder` - the
 * server actually delegates back to the create flow internally. */
export function reorder(
  originalOrderId: string,
  input: ReorderInput,
  accessToken: string,
): Promise<CreateOrderResult> {
  return apiRequest<CreateOrderResult>(`/orders/${originalOrderId}/reorder`, {
    method: 'POST',
    body: input,
    accessToken,
  });
}

/**
 * Customer self-cancel (UK Consumer Contracts Regulations 2013).
 * Hits POST /v1/orders/:id/cancel - the legacy PATCH /status route is
 * vendor/admin only and 403s for customers.
 */
export function cancelOrder(orderId: string, reason: string, accessToken: string): Promise<Order> {
  return apiRequest<Order>(`/orders/${orderId}/cancel`, {
    method: 'POST',
    body: { reason },
    accessToken,
  });
}
