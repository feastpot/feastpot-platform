import { createHash, randomUUID } from 'node:crypto';

import { expect, test as base, type APIRequestContext, type Page } from '@playwright/test';

import {
  TestDataFactory,
  type CheckoutScenario,
  type CheckoutScenarioFixture,
  type FactoryState,
  type TestIdentity,
} from '../../../../scripts/test-factory';
import { calcServiceFeePence } from '../../src/lib/service-fee';

/**
 * The deterministic scenarios use browser route fixtures.  They deliberately
 * exercise the customer UI without adding an application-only test route.
 * The smoke test uses the same factory conventions when a safe test database
 * is supplied by CI, but never creates data against production (the factory
 * has a production URL guard).
 */
export const test = base.extend<{ customer: CustomerFixture; cookieConsent: void }>({
  cookieConsent: [
    async ({ page }, use) => {
      await page.addLocatorHandler(
        page.getByRole('dialog', { name: 'Cookie notice' }),
        async () => {
          await page.getByRole('button', { name: 'Essential only', exact: true }).click();
        },
      );
      await use();
    },
    { auto: true },
  ],
  customer: async ({ page }, provide) => {
    await provide(new CustomerFixture(page));
  },
});

export { expect };

export const CUSTOMER_E2E_REQUIRED_ENV = [
  'TEST_API_URL',
  'NEXT_PUBLIC_API_URL',
  'SUPABASE_DB_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TEST_FACTORY_PASSWORD',
  'TEST_FACTORY_NAMESPACE',
  'CUSTOMER_E2E_ALLOWED_API_ORIGIN',
  'CUSTOMER_E2E_ALLOWED_SUPABASE_REF',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_SECRET_KEY_TEST',
] as const;

export function assertCustomerSmokeEnvironment(): void {
  const missing = CUSTOMER_E2E_REQUIRED_ENV.filter((key) => !process.env[key]?.trim());
  if (missing.length) {
    throw new Error(
      `CUSTOMER_E2E_CREDENTIALS_REQUIRED: missing ${missing.join(', ')}. ` +
        'Customer purchase coverage must not be silently skipped in CI.',
    );
  }
  if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!.startsWith('pk_test_')) {
    throw new Error(
      'CUSTOMER_E2E_TEST_KEY_REQUIRED: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must be a pk_test_ key.',
    );
  }
  if (!process.env.STRIPE_SECRET_KEY_TEST!.startsWith('sk_test_')) {
    throw new Error(
      'CUSTOMER_E2E_TEST_KEY_REQUIRED: STRIPE_SECRET_KEY_TEST must be an sk_test_ key.',
    );
  }
  if (
    process.env.CUSTOMER_E2E_USE_FACTORY !== 'true' ||
    process.env.CUSTOMER_E2E_ISOLATED_ENVIRONMENT !== 'true'
  ) {
    throw new Error(
      'CUSTOMER_E2E_ISOLATION_REQUIRED: explicitly enable the factory and isolated environment.',
    );
  }

  const api = new URL(process.env.TEST_API_URL!);
  const approvedApiOrigin = new URL(process.env.CUSTOMER_E2E_ALLOWED_API_ORIGIN!);
  if (
    api.toString().replace(/\/+$/, '') !==
    new URL(process.env.NEXT_PUBLIC_API_URL!).toString().replace(/\/+$/, '')
  ) {
    throw new Error(
      'CUSTOMER_E2E_API_MISMATCH: browser checkout and smoke verification must use the same API.',
    );
  }
  if (api.origin !== approvedApiOrigin.origin) {
    throw new Error(
      'CUSTOMER_E2E_API_GUARD: TEST_API_URL must exactly match the approved isolated API origin.',
    );
  }

  const publicRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  const database = new URL(process.env.SUPABASE_DB_URL!);
  const databaseHostParts = database.hostname.split('.');
  const databaseRef =
    decodeURIComponent(database.username).split('.')[1] ??
    (database.hostname.endsWith('.supabase.co')
      ? databaseHostParts[0] === 'db'
        ? databaseHostParts[1]
        : databaseHostParts[0]
      : null);
  const approvedRef = process.env.CUSTOMER_E2E_ALLOWED_SUPABASE_REF;
  if (!publicRef || !databaseRef || publicRef !== databaseRef || publicRef !== approvedRef) {
    throw new Error(
      'CUSTOMER_E2E_SUPABASE_MISMATCH: browser auth and factory database must use the same isolated Supabase project.',
    );
  }
  if (
    process.env.TEST_FACTORY_NAMESPACE === 'local' ||
    process.env.TEST_FACTORY_NAMESPACE!.length < 8
  ) {
    throw new Error(
      'CUSTOMER_E2E_NAMESPACE_REQUIRED: use a unique per-run TEST_FACTORY_NAMESPACE.',
    );
  }
}

export class CustomerFixture {
  // One namespace per test/retry; permutations within a test intentionally
  // share their vendor so payout comparisons use the same trading account.
  private readonly namespace = `${createHash('sha256')
    .update(process.env.TEST_FACTORY_NAMESPACE ?? 'customer')
    .digest('hex')
    .slice(0, 12)}-${randomUUID().replaceAll('-', '').slice(0, 12)}`;

  constructor(readonly page: Page) {}

  async mockVendorSearch(
    vendors: VendorFixture[],
    cardExtras: VendorCardExtrasFixture = { trustSignals: {}, capacity: {} },
  ): Promise<void> {
    await this.page.route('**/v1/vendors**', async (route) => {
      const url = new URL(route.request().url());
      // Card extras has a distinct response contract.
      if (url.pathname.endsWith('/card-extras')) {
        await route.fulfill({ json: cardExtras });
        return;
      }
      // Discovery may be mocked while detail/menu reads remain real, notably
      // in the mobile purchase journey. Never return a list envelope for them.
      if (!url.pathname.endsWith('/vendors')) {
        await route.fallback();
        return;
      }
      await route.fulfill({ json: { data: vendors, nextCursor: null } });
    });
  }

  /**
   * Opt-in factory access for suites that need persisted API fixtures. Keeping
   * this behind an explicit environment switch prevents local browser tests
   * from unexpectedly touching a database.
   */
  async provision(
    states: FactoryState[],
  ): Promise<{ factory: TestDataFactory; identities: TestIdentity[] }> {
    if (process.env.CUSTOMER_E2E_USE_FACTORY !== 'true') {
      throw new Error(
        'CUSTOMER_E2E_FACTORY_DISABLED: set CUSTOMER_E2E_USE_FACTORY=true with a safe SUPABASE_DB_URL.',
      );
    }
    const factory = TestDataFactory.fromEnvironment({
      namespace: this.namespace,
    });
    const identities: TestIdentity[] = [];
    try {
      for (const state of states) {
        identities.push(
          state === 'V9' ? await factory.createPurchaseVendor() : await factory.create(state),
        );
      }
      return {
        factory,
        identities,
      };
    } catch (error) {
      for (const identity of identities.reverse()) {
        await factory.teardown(identity).catch(() => undefined);
      }
      await factory.dispose();
      throw error;
    }
  }

  /** Provision one DB-backed checkout pricing permutation and its vendor. */
  async provisionCheckoutScenario(
    scenario: CheckoutScenario,
  ): Promise<{ factory: TestDataFactory; fixture: CheckoutScenarioFixture }> {
    if (process.env.CUSTOMER_E2E_USE_FACTORY !== 'true') {
      throw new Error(
        'CUSTOMER_E2E_FACTORY_DISABLED: set CUSTOMER_E2E_USE_FACTORY=true with a safe SUPABASE_DB_URL.',
      );
    }
    const factory = TestDataFactory.fromEnvironment({
      namespace: this.namespace,
    });
    try {
      return { factory, fixture: await factory.createCheckoutScenario(scenario) };
    } catch (error) {
      await factory.dispose();
      throw error;
    }
  }
}

export interface VendorFixture {
  id: string;
  slug: string;
  businessName: string;
  cuisines: string[];
  status: 'live' | 'suspended';
  rating: number;
  ratingCount: number;
  createdAt: string;
  minOrderPence?: number;
  availableSlots?: number;
}

/**
 * Search cards make a second, batch request for capacity and verified signals.
 * Keeping it alongside the browser search fixture lets discovery scenarios use
 * the same public API contract as a real results page.
 */
export interface VendorCardExtrasFixture {
  trustSignals: Record<string, Array<{ signalType: string; verifiedAt: string | null }>>;
  capacity: Record<
    string,
    Array<{
      serviceDate: string;
      capacityType: 'family_pot' | 'party_tray' | 'event_catering' | 'meal_prep';
      totalSlots: number;
      slotsTaken: number;
      remainingSlots: number;
      preorderCutoffAt: string | null;
    }>
  >;
}

export function vendor(overrides: Partial<VendorFixture> = {}): VendorFixture {
  return {
    id: 'vendor-1',
    slug: 'fixture-kitchen',
    businessName: 'Fixture Kitchen',
    cuisines: ['Nigerian'],
    status: 'live',
    rating: 4.9,
    ratingCount: 12,
    createdAt: '2025-01-01T00:00:00.000Z',
    minOrderPence: 1500,
    ...overrides,
  };
}

export function serviceFee(subtotalPence: number, waived: boolean): number {
  return waived ? 0 : calcServiceFeePence(subtotalPence);
}

/** The service fee is platform revenue and must never affect vendor payout. */
export function vendorPayout(subtotalPence: number, commissionPence: number): number {
  return subtotalPence - commissionPence;
}

export interface InspectedPaymentState {
  namespace: string;
  orders: Array<{
    id: string;
    status: string;
    subtotalPence: number;
    deliveryFeePence: number;
    serviceFeePence: number;
    discountPence: number;
    totalPence: number;
    payments: Array<{ id: string; orderId: string; status: string }>;
    disputes: Array<{ id: string; orderId: string; status: string }>;
  }>;
}

/**
 * Read the API-owned state for an isolated factory customer. This is not a
 * general inspection API: the server fails closed unless test mode, namespace
 * and factory-customer bearer token all match.
 */
export async function inspectFactoryPaymentState(
  request: APIRequestContext,
  accessToken: string,
): Promise<InspectedPaymentState> {
  if (!process.env.TEST_FACTORY_NAMESPACE) throw new Error('CUSTOMER_E2E_NAMESPACE_REQUIRED');
  const claims = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString());
  const namespace = /^tf-([a-z0-9-]+)-c\d+@test\.feastpot\.co\.uk$/i.exec(
    String(claims.email ?? ''),
  )?.[1];
  if (!namespace) throw new Error('CUSTOMER_E2E_NAMESPACE_REQUIRED');
  const response = await request.get(`${process.env.TEST_API_URL}/v1/test/payment-state`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-test-factory-namespace': namespace,
    },
  });
  if (!response.ok()) {
    throw new Error(`CUSTOMER_E2E_STATE_INSPECTION_FAILED: ${response.status()}`);
  }
  const state = (await response.json()) as InspectedPaymentState;
  expect(state.namespace).toBe(namespace);
  for (const order of state.orders) {
    for (const payment of order.payments) expect(payment.orderId).toBe(order.id);
  }
  return state;
}

/** Manual capture must authorise the full total without marking it captured. */
export async function expectFactoryPaymentAuthorised(
  factory: TestDataFactory,
  state: InspectedPaymentState,
): Promise<void> {
  expect(state.orders).toHaveLength(1);
  const order = state.orders[0]!;
  expect(order.payments).toHaveLength(1);
  expect(order.payments[0]!.status).toBe('pending');
  const payment = await factory.prisma.payment.findUniqueOrThrow({
    where: { id: order.payments[0]!.id },
  });
  expect(payment.amountPence).toBe(order.totalPence);
  expect(payment.stripePaymentIntentId).toBeTruthy();
  const response = await fetch(
    `https://api.stripe.com/v1/payment_intents/${payment.stripePaymentIntentId}`,
    {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY_TEST}` },
      signal: AbortSignal.timeout(30_000),
    },
  );
  expect(response.ok).toBe(true);
  const intent = await response.json();
  expect(intent.status).toBe('requires_capture');
  expect(intent.amount).toBe(order.totalPence);
  expect(intent.amount_capturable).toBe(order.totalPence);
  expect(intent.metadata.orderId).toBe(order.id);
}
