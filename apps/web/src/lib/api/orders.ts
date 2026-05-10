import { apiRequest, type ApiRequestOptions } from './client';

/**
 * The order subset the customer-facing UI uses. The API returns the full
 * Prisma `Order` with related rows; we only narrow the shape here so the UI
 * has type-safe access to the fields it actually reads.
 */
export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'dispatched'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

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
  phone?: string | null;
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
  createdAt: string;
  items?: OrderItem[];
  vendor?: OrderVendorSummary;
}

export interface CreateOrderInput {
  vendorId: string;
  items: { menuItemId: string; quantity: number; customisationNotes?: string }[];
  deliveryAddressId?: string;
  scheduledFor: string; // ISO 8601
  notes?: string;
  discountCode?: string;
}

export interface CreateOrderResult {
  order: Order;
  /** Stripe PaymentIntent client secret — pass to `stripe.confirmCardPayment`. */
  clientSecret: string;
}

export function createOrder(input: CreateOrderInput, accessToken: string): Promise<CreateOrderResult> {
  return apiRequest<CreateOrderResult>('/orders', {
    method: 'POST',
    body: input,
    accessToken,
  });
}

export function confirmOrder(orderId: string, accessToken: string): Promise<{ confirmed: boolean; orderId: string }> {
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

/** Returns the same `{ order, clientSecret }` shape as `createOrder` — the
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
 * Customer-initiated cancellation.
 *
 * BACKEND GAP: the API only exposes `PATCH /v1/orders/:id/status` with
 * `vendor`/`admin` roles — there's no customer-callable cancel endpoint
 * today. We attempt the call so cancellation works the moment the API team
 * adds the role; until then the FE surfaces a 403 with a helpful message
 * ("contact the vendor to cancel").
 */
export function cancelOrder(orderId: string, accessToken: string): Promise<Order> {
  return apiRequest<Order>(`/orders/${orderId}/status`, {
    method: 'PATCH',
    body: { status: 'cancelled' },
    accessToken,
  });
}
