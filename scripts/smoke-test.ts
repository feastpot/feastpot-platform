/**
 * Feastpot end-to-end order-lifecycle smoke test.
 *
 * Drives a full customer → vendor → delivery → Stripe-capture flow against a
 * running Feastpot API (default: http://localhost:3001) using Stripe **test
 * mode**. Logs each step with ✅/❌ and exits 1 on first failure for CI use.
 *
 * Required env:
 *   STRIPE_SECRET_KEY            Stripe test secret (sk_test_...)
 *   NEXT_PUBLIC_SUPABASE_URL     Supabase project URL (already in this repl)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY  Supabase anon key (already in this repl)
 *
 * Optional env:
 *   API_URL                      Defaults to http://localhost:3001
 *   CUSTOMER_EMAIL / CUSTOMER_PASSWORD   Defaults to seeded grace@example.com
 *   VENDOR_EMAIL   / VENDOR_PASSWORD     Defaults to seeded maman@feastpot.co.uk
 *
 * Run:    npm run smoke-test
 */

import Stripe from 'stripe';

// ─────────────────────────── Config ───────────────────────────

const API = process.env.API_URL ?? 'http://localhost:3001';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;

const CUSTOMER_EMAIL = process.env.CUSTOMER_EMAIL ?? 'grace@example.com';
const CUSTOMER_PASSWORD = process.env.CUSTOMER_PASSWORD ?? 'Feastpot!Cust1';
const VENDOR_EMAIL = process.env.VENDOR_EMAIL ?? 'maman@feastpot.co.uk';
const VENDOR_PASSWORD = process.env.VENDOR_PASSWORD ?? 'Feastpot!Vendor1';

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    console.error(`❌ Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

requireEnv('STRIPE_SECRET_KEY', STRIPE_KEY);
requireEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', SUPABASE_ANON);

// Match the API's pinned Stripe API version so behaviour parity is exact.
const stripe = new Stripe(STRIPE_KEY!, {
  apiVersion: '2024-11-20.acacia' as Stripe.LatestApiVersion,
});

// ─────────────────────────── Helpers ───────────────────────────

function log(ok: boolean, msg: string, detail?: unknown): void {
  console.log(`${ok ? '✅' : '❌'} ${msg}`);
  if (!ok) {
    if (detail !== undefined) console.error('   Detail:', JSON.stringify(detail, null, 2));
    process.exit(1);
  }
}

interface ApiResponse<T = unknown> {
  status: number;
  body: T;
}

async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<ApiResponse<T>> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* leave as text */
  }
  return { status: res.status, body: parsed as T };
}

/**
 * Authenticate against Supabase Auth directly (the API has no /auth/login —
 * it trusts Supabase-issued JWTs via SupabaseAuthGuard).
 */
async function supabaseLogin(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = (await res.json()) as { access_token?: string; msg?: string; error?: string };
  if (!json.access_token) {
    throw new Error(`Supabase login failed for ${email}: ${json.msg ?? json.error ?? 'no token'}`);
  }
  return json.access_token;
}

// ─────────────────────────── Types ───────────────────────────

interface Vendor { id: string; businessName: string }
interface VendorListResp { data: Vendor[]; nextCursor: string | null }
interface Menu { id: string; name: string; isActive?: boolean }
interface MenuItem { id: string; name: string; basePricePence: number; isAvailable: boolean }
interface Address { id: string }
interface OrderRecord {
  id: string;
  stripePaymentIntentId: string | null;
  commissionPence: number;
  vendorPayoutPence: number;
  totalPence: number;
}
interface CreateOrderResponse { order: OrderRecord; clientSecret: string }

// ─────────────────────────── Main flow ───────────────────────────

async function main(): Promise<void> {
  console.log('\n🚀 Feastpot Order Lifecycle Smoke Test\n');
  console.log('  API           :', API);
  console.log('  Stripe mode   : test');
  console.log('  Customer      :', CUSTOMER_EMAIL);
  console.log('  Vendor        :', VENDOR_EMAIL, '\n');

  // STEP 1 — Health
  const health = await api('GET', '/health');
  log(health.status === 200, 'API health check', health);

  // STEP 2 — Customer login (via Supabase, not /v1/auth/login)
  const customerToken = await supabaseLogin(CUSTOMER_EMAIL, CUSTOMER_PASSWORD);
  log(!!customerToken, 'Customer login (Supabase)');

  // STEP 3 — Fetch vendors (use a live vendor; default API filter is status=live)
  const vendorsRes = await api<VendorListResp>('GET', '/v1/vendors?limit=1', undefined, customerToken);
  const vendor = vendorsRes.body?.data?.[0];
  log(vendorsRes.status === 200 && !!vendor, 'Fetch vendors list', vendorsRes);
  console.log('   Vendor:', vendor!.businessName);

  // STEP 4 — Pick a menu + an available item
  const menusRes = await api<Menu[]>('GET', `/v1/vendors/${vendor!.id}/menus`, undefined, customerToken);
  log(menusRes.status === 200 && Array.isArray(menusRes.body) && menusRes.body.length > 0,
    'Fetch vendor menus', menusRes);
  const menu = menusRes.body[0];

  const itemsRes = await api<MenuItem[]>(
    'GET',
    `/v1/vendors/${vendor!.id}/menus/${menu.id}/items`,
    undefined,
    customerToken,
  );
  log(itemsRes.status === 200 && Array.isArray(itemsRes.body), 'Fetch menu items', itemsRes);
  const item = itemsRes.body.find((i) => i.isAvailable);
  log(!!item, 'At least one available menu item exists', itemsRes.body);
  console.log('   Item:', item!.name, '£' + (item!.basePricePence / 100).toFixed(2));

  // STEP 5 — Customer address (reuse first if present, else create)
  let addressId: string;
  const addressRes = await api<Address[]>('GET', '/v1/addresses', undefined, customerToken);
  log(addressRes.status === 200, 'Fetch customer addresses', addressRes);
  if (Array.isArray(addressRes.body) && addressRes.body.length > 0) {
    addressId = addressRes.body[0].id;
    console.log('   Reusing address:', addressId);
  } else {
    const created = await api<Address>(
      'POST',
      '/v1/addresses',
      { line1: '45 Rye Lane', city: 'London', postcode: 'SE15 4ST', isDefault: true },
      customerToken,
    );
    log(created.status === 201, 'Create test delivery address', created);
    addressId = created.body.id;
    console.log('   Created address:', addressId);
  }

  // STEP 6 — Create order (lead-time gate is configurable; +26h is safe)
  const scheduledFor = new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString();
  const orderRes = await api<CreateOrderResponse>(
    'POST',
    '/v1/orders',
    {
      vendorId: vendor!.id,
      items: [{ menuItemId: item!.id, quantity: 1 }],
      deliveryAddressId: addressId,
      scheduledFor,
    },
    customerToken,
  );
  log(orderRes.status === 201, 'Create order', orderRes);
  const { order, clientSecret } = orderRes.body;
  log(!!order?.stripePaymentIntentId, 'Order has Stripe PaymentIntent', order);
  log(!!clientSecret, 'clientSecret returned in order response');
  console.log('   Order ID :', order.id);
  console.log('   Stripe PI:', order.stripePaymentIntentId);

  // STEP 7 — PI is in manual capture, not yet captured
  const pi = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId!);
  log(pi.capture_method === 'manual', 'PaymentIntent capture_method = manual',
    { capture_method: pi.capture_method });
  log(
    pi.status === 'requires_payment_method' ||
      pi.status === 'requires_confirmation' ||
      pi.status === 'requires_action',
    'PaymentIntent not yet captured (pre-payment)',
    { status: pi.status },
  );

  // STEP 8 — Confirm payment via Stripe test PM, then call API confirm
  const confirmedPi = await stripe.paymentIntents.confirm(order.stripePaymentIntentId!, {
    payment_method: 'pm_card_visa',
  });
  log(confirmedPi.status === 'requires_capture',
    'PaymentIntent → requires_capture after Stripe confirm', { status: confirmedPi.status });

  const confirmRes = await api('POST', `/v1/orders/${order.id}/confirm`, undefined, customerToken);
  log(confirmRes.status === 200 || confirmRes.status === 201, 'Order confirmed via API', confirmRes);

  // STEP 9 — Vendor login + accept
  const vendorToken = await supabaseLogin(VENDOR_EMAIL, VENDOR_PASSWORD);
  log(!!vendorToken, 'Vendor login (Supabase)');

  const acceptRes = await api(
    'PATCH',
    `/v1/orders/${order.id}/status`,
    { status: 'accepted' },
    vendorToken,
  );
  log(acceptRes.status === 200, 'Vendor accepted order', acceptRes);

  // STEP 10 — Progress: preparing → dispatched
  for (const status of ['preparing', 'dispatched'] as const) {
    const r = await api('PATCH', `/v1/orders/${order.id}/status`, { status }, vendorToken);
    log(r.status === 200, `Order status → ${status}`, r);
  }

  // STEP 11 — Mark delivered (this triggers stripe.capture in OrdersService)
  const deliveredRes = await api(
    'PATCH',
    `/v1/orders/${order.id}/status`,
    { status: 'delivered' },
    vendorToken,
  );
  log(deliveredRes.status === 200, 'Order marked delivered', deliveredRes);

  // Capture is awaited in-process so it should be done by the time the
  // PATCH resolves, but give Stripe a small grace window for state propagation.
  await new Promise((r) => setTimeout(r, 2000));

  const capturedPi = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId!);
  log(capturedPi.status === 'succeeded', 'Stripe PaymentIntent captured on delivery',
    { status: capturedPi.status });

  // STEP 12 — Sanity: API still healthy after the lifecycle
  const finalHealth = await api('GET', '/health');
  log(finalHealth.status === 200, 'API still healthy after full order lifecycle');

  console.log('\n✅ All smoke tests passed!\n');
  console.log('Summary:');
  console.log('  Order ID       :', order.id);
  console.log('  PaymentIntent  :', order.stripePaymentIntentId, '→ succeeded');
  console.log('  Total          : £' + (order.totalPence / 100).toFixed(2));
  console.log('  Commission     : £' + ((order.commissionPence ?? 0) / 100).toFixed(2));
  console.log('  Net to vendor  : £' + ((order.vendorPayoutPence ?? 0) / 100).toFixed(2));
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('\n❌ Smoke test crashed:', msg);
  process.exit(1);
});
