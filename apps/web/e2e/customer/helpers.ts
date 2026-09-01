import { expect, test as base, type Page } from '@playwright/test';

import {
  TestDataFactory,
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
export const test = base.extend<{ customer: CustomerFixture }>({
  customer: async ({ page }, use) => {
    await use(new CustomerFixture(page));
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
  constructor(readonly page: Page) {}

  async mockVendorSearch(vendors: VendorFixture[]): Promise<void> {
    await this.page.route('**/v1/vendors**', async (route) => {
      const url = new URL(route.request().url());
      // Card extras has a distinct response contract.
      if (url.pathname.endsWith('/card-extras')) {
        await route.fulfill({ json: { trustSignals: {}, capacity: {} } });
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
    const factory = TestDataFactory.fromEnvironment();
    const identities: TestIdentity[] = [];
    try {
      for (const state of states) identities.push(await factory.create(state));
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
