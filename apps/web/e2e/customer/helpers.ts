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
  'TEST_CUSTOMER_EMAIL',
  'TEST_CUSTOMER_PASSWORD',
  'TEST_CUSTOMER_VENDOR_SLUG',
  'TEST_CUSTOMER_VENDOR_ID',
  'TEST_CUSTOMER_MENU_ITEM_ID',
  'TEST_CUSTOMER_ADDRESS_ID',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
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
    try {
      return {
        factory,
        identities: await Promise.all(states.map((state) => factory.create(state))),
      };
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
