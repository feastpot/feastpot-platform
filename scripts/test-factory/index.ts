import { createHmac, createHash, randomUUID } from 'node:crypto';

import { PrismaClient, type FeastPassStatus, type UserRole } from '@prisma/client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const FACTORY_STATES = [
  'C1',
  'C2',
  'C3',
  'C4',
  'C5',
  'C6',
  'V1',
  'V2',
  'V3',
  'V4',
  'V5',
  'V6',
  'V7',
  'V8',
  'V9',
  'V10',
  'V11',
  'A1',
  'A2',
  'A3',
] as const;

export type FactoryState = (typeof FACTORY_STATES)[number];
type CustomerState = Extract<FactoryState, `C${number}`>;
type VendorState = Extract<FactoryState, `V${number}`>;
type AdminState = Extract<FactoryState, `A${number}`>;

export interface TestFactoryOptions {
  databaseUrl?: string;
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  supabaseAnonKey?: string;
  password?: string;
  namespace?: string;
  prisma?: PrismaClient;
}

export interface TestCredentials {
  email: string;
  password: string | null;
  role: UserRole;
}

export interface TestIdentity {
  state: FactoryState;
  credentials: TestCredentials;
  userId: string;
  vendorId?: string;
  vendorApplicationId?: string;
  orderId?: string;
  payoutId?: string;
  disputeId?: string;
  cateringBookingId?: string;
  /** A current AAL2 token when the A2 state was provisioned with Supabase. */
  accessToken?: string;
  relatedUserIds: string[];
  relatedVendorIds: string[];
  storageObjects: Array<{ bucket: string; path: string }>;
}

interface FactoryUser {
  id: string;
  email: string;
  password: string | null;
  role: UserRole;
}

/**
 * Test data must never be aimed at the production database. Exact comparison
 * catches the configured production URLs, while the hostname check catches
 * obvious accidental production targets in standalone CI jobs.
 */
export function assertSafeDatabaseUrl(
  databaseUrl: string | undefined,
): asserts databaseUrl is string {
  if (!databaseUrl) {
    throw new Error('TEST_FACTORY_DATABASE_REQUIRED: set SUPABASE_DB_URL or pass databaseUrl.');
  }

  const normalised = databaseUrl.trim().replace(/\/+$/, '');
  const configuredProduction = [process.env.PROD_DATABASE_URL, process.env.PROD_DIRECT_URL]
    .filter((url): url is string => Boolean(url))
    .map((url) => url.trim().replace(/\/+$/, ''));

  if (
    configuredProduction.includes(normalised) ||
    /(^|[._-])(prod|production)([._-]|$)/i.test(normalised)
  ) {
    throw new Error(
      'TEST_FACTORY_PRODUCTION_GUARD: refusing to create test data against a production database.',
    );
  }
}

function safeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function stateEmail(namespace: string, state: FactoryState): string {
  return `tf-${safeKey(namespace)}-${state.toLowerCase()}@test.feastpot.co.uk`;
}

function slug(namespace: string, state: FactoryState): string {
  return `test-factory-${safeKey(namespace)}-${state.toLowerCase()}`;
}

function orderNumber(namespace: string, state: FactoryState): string {
  return `TF-${safeKey(namespace).replace(/-/g, '').slice(0, 12).toUpperCase()}-${state}`;
}

function deterministicExternalId(kind: string, namespace: string, state: FactoryState): string {
  return `${kind}_tf_${safeKey(namespace)}_${state.toLowerCase()}`;
}

function isCustomerState(state: FactoryState): state is CustomerState {
  return state.startsWith('C');
}

function isVendorState(state: FactoryState): state is VendorState {
  return state.startsWith('V');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Small RFC 6238 implementation so the A2 state is a real Supabase MFA
 * account without introducing a second OTP dependency just for test fixtures.
 */
function base32ToBuffer(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.toUpperCase().replace(/=+$/g, '');
  let bits = '';
  for (const character of clean) {
    const index = alphabet.indexOf(character);
    if (index === -1) throw new Error('TEST_FACTORY_INVALID_TOTP_SECRET');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret: string): string {
  const counter = Math.floor(Date.now() / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', base32ToBuffer(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const code =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!;
  return String(code % 1_000_000).padStart(6, '0');
}

/**
 * Creates isolated, deterministic identities for browser, API and service
 * tests. With Supabase credentials configured it creates a real Auth user and
 * keeps its app metadata in sync with the matching platform user. In an
 * ephemeral database-only CI job it still creates the complete platform data,
 * but sign-in helpers correctly report that Auth is unavailable.
 */
export class TestDataFactory {
  readonly prisma: PrismaClient;
  private readonly ownsPrisma: boolean;
  private readonly admin: SupabaseClient | null;
  private readonly anon: SupabaseClient | null;
  private readonly namespace: string;
  private readonly password: string | null;

  constructor(options: TestFactoryOptions = {}) {
    const databaseUrl = options.databaseUrl ?? process.env.SUPABASE_DB_URL;
    if (!options.prisma) assertSafeDatabaseUrl(databaseUrl);

    this.prisma =
      options.prisma ??
      new PrismaClient({
        datasources: { db: { url: databaseUrl } },
      });
    this.ownsPrisma = !options.prisma;
    this.namespace = options.namespace ?? process.env.TEST_FACTORY_NAMESPACE ?? 'local';
    this.password = options.password ?? process.env.TEST_FACTORY_PASSWORD ?? null;

    const rawSupabaseUrl =
      options.supabaseUrl ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseUrl = rawSupabaseUrl
      ? rawSupabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '')
      : undefined;
    const serviceRoleKey = options.supabaseServiceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey =
      options.supabaseAnonKey ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.SUPABASE_ANON_KEY;

    this.admin =
      supabaseUrl && serviceRoleKey
        ? createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
        : null;
    this.anon =
      supabaseUrl && anonKey
        ? createClient(supabaseUrl, anonKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
        : null;
  }

  static fromEnvironment(options: Omit<TestFactoryOptions, 'databaseUrl'> = {}): TestDataFactory {
    return new TestDataFactory({ ...options, databaseUrl: process.env.SUPABASE_DB_URL });
  }

  async dispose(): Promise<void> {
    if (this.ownsPrisma) await this.prisma.$disconnect();
  }

  async create(state: FactoryState): Promise<TestIdentity> {
    if (!FACTORY_STATES.includes(state)) {
      throw new Error(`TEST_FACTORY_UNKNOWN_STATE: ${state}`);
    }

    if (isCustomerState(state)) return this.createCustomerState(state);
    if (isVendorState(state)) return this.createVendorState(state);
    return this.createAdminState(state as AdminState);
  }

  async createAll(): Promise<TestIdentity[]> {
    const identities: TestIdentity[] = [];
    for (const state of FACTORY_STATES) identities.push(await this.create(state));
    return identities;
  }

  async teardown(identity: TestIdentity): Promise<void> {
    const userIds = [...new Set([identity.userId, ...identity.relatedUserIds])];
    const vendorIds = [
      ...new Set([...(identity.vendorId ? [identity.vendorId] : []), ...identity.relatedVendorIds]),
    ];

    await this.prisma.$transaction(async (tx) => {
      const orders = await tx.order.findMany({
        where: { OR: [{ customerId: { in: userIds } }, { vendorId: { in: vendorIds } }] },
        select: { id: true },
      });
      const orderIds = orders.map((order) => order.id);
      const payments = orderIds.length
        ? await tx.payment.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } })
        : [];
      const paymentIds = payments.map((payment) => payment.id);
      const bookings = await tx.cateringBooking.findMany({
        where: {
          OR: [
            { customerId: { in: userIds } },
            { vendorId: { in: vendorIds } },
            ...(identity.cateringBookingId ? [{ id: identity.cateringBookingId }] : []),
          ],
        },
        select: { id: true, enquiryId: true },
      });

      if (bookings.length) {
        await tx.cateringBooking.deleteMany({
          where: { id: { in: bookings.map((booking) => booking.id) } },
        });
        await tx.cateringEnquiry.deleteMany({
          where: { id: { in: bookings.map((booking) => booking.enquiryId) } },
        });
      }
      if (orderIds.length) {
        await tx.dispute.deleteMany({ where: { orderId: { in: orderIds } } });
        await tx.chargeback.deleteMany({
          where: {
            OR: [
              { orderId: { in: orderIds } },
              ...(paymentIds.length ? [{ paymentId: { in: paymentIds } }] : []),
            ],
          },
        });
        await tx.payout.deleteMany({
          where: { OR: [{ orderId: { in: orderIds } }, { vendorId: { in: vendorIds } }] },
        });
        await tx.payment.deleteMany({ where: { orderId: { in: orderIds } } });
        await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
        await tx.order.deleteMany({ where: { id: { in: orderIds } } });
      }

      await tx.dispute.deleteMany({ where: { raisedById: { in: userIds } } });
      await tx.feastPassSubscription.deleteMany({ where: { userId: { in: userIds } } });
      await tx.termsAcceptance.deleteMany({ where: { vendorId: { in: vendorIds } } });
      await tx.vendorEnforcementAction.deleteMany({ where: { vendorId: { in: vendorIds } } });
      await tx.vendorApplication.deleteMany({
        where: {
          OR: [
            ...(identity.vendorApplicationId ? [{ id: identity.vendorApplicationId }] : []),
            {
              email: {
                in: (
                  await tx.user.findMany({
                    where: { id: { in: userIds } },
                    select: { email: true },
                  })
                ).map((user) => user.email),
              },
            },
          ],
        },
      });
      await tx.vendor.deleteMany({ where: { id: { in: vendorIds } } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
      await tx.termsVersion.deleteMany({
        where: {
          documentType: 'VENDOR_TERMS',
          version: { in: [this.termsVersionLabel('v1'), this.termsVersionLabel('v2')] },
        },
      });
    });

    if (this.admin && identity.storageObjects.length > 0) {
      const grouped = new Map<string, Array<{ bucket: string; path: string }>>();
      for (const object of identity.storageObjects) {
        const objects = grouped.get(object.bucket) ?? [];
        objects.push(object);
        grouped.set(object.bucket, objects);
      }
      await Promise.all(
        [...grouped.entries()].map(async ([bucket, objects]) => {
          await this.admin!.storage.from(bucket).remove(objects.map((object) => object.path));
        }),
      );
    }
    if (this.admin) {
      await Promise.all(userIds.map((userId) => this.admin!.auth.admin.deleteUser(userId)));
    }
  }

  private async createCustomerState(state: CustomerState): Promise<TestIdentity> {
    const user = await this.ensureUser(state, 'customer');
    const identity = this.identity(state, user);

    if (state === 'C2') await this.ensureAddress(user.id, state);
    if (state === 'C3' || state === 'C6') {
      const order = await this.ensureCompletedOrder(identity, user.id, state);
      identity.orderId = order.id;
      if (state === 'C6') {
        const dispute = await this.prisma.dispute.upsert({
          where: { orderId: order.id },
          update: { status: 'open', raisedById: user.id },
          create: {
            orderId: order.id,
            raisedById: user.id,
            issueType: 'quality',
            severity: 'medium',
            description: 'Test factory open dispute. This row is safe to remove during teardown.',
            status: 'open',
          },
        });
        identity.disputeId = dispute.id;
      }
    }
    if (state === 'C4' || state === 'C5') {
      await this.ensureFeastPass(user.id, state === 'C4' ? 'ACTIVE' : 'PAST_DUE', state);
    }
    return identity;
  }

  private async createVendorState(state: VendorState): Promise<TestIdentity> {
    if (state === 'V1') {
      // An applicant is intentionally not a vendor-portal user yet. Keep their
      // Auth/platform account as customer role so it can sign in normally while
      // the application waits for approval.
      const user = await this.ensureUser(state, 'customer');
      const identity = this.identity(state, user);
      const application =
        (await this.prisma.vendorApplication.findFirst({ where: { email: user.email } })) ??
        (await this.prisma.vendorApplication.create({
          data: {
            fullName: 'Test Factory Applicant',
            kitchenName: `Test Factory ${state} Kitchen`,
            email: user.email,
            phone: '07700900000',
            postcode: 'SE15 4ST',
            cuisineType: 'Test cuisine',
            kitchenType: 'home',
            hasFsaRegistration: true,
            foodStory:
              'Test factory applicant used only by automated browser and API test scenarios.',
            status: 'pending',
            acceptedTermsAt: new Date(),
            acceptedTermsVersion: 'test-factory-v1',
          },
        }));
      identity.vendorApplicationId = application.id;
      return identity;
    }

    const user = await this.ensureUser(state, 'vendor');
    const identity = this.identity(state, user);
    const vendor = await this.ensureVendor(identity, user, state);
    identity.vendorId = vendor.id;

    if (state === 'V4') {
      // Keep repeated factory runs honest even if this namespace was created by
      // an older factory version that gave every vendor a default menu.
      await this.prisma.menuItem.deleteMany({ where: { vendorId: vendor.id } });
      await this.prisma.menu.deleteMany({ where: { vendorId: vendor.id } });
    }
    if (state === 'V2') {
      await this.prisma.vendor.update({
        where: { id: vendor.id },
        data: { status: 'approved', stripeAccountId: null, payoutsEnabled: false },
      });
    }
    if (state === 'V3') {
      await this.prisma.vendor.update({
        where: { id: vendor.id },
        data: {
          status: 'approved',
          stripeAccountId: deterministicExternalId('acct', this.namespace, state),
          payoutsEnabled: false,
        },
      });
    }
    if (state === 'V5') {
      const order = await this.ensureCompletedOrder(identity, user.id, state, vendor.id);
      identity.orderId = order.id;
      const payout = await this.prisma.payout.upsert({
        where: {
          payouts_vendor_period_unique: {
            vendorId: vendor.id,
            periodEnd: new Date('2030-01-07T00:00:00.000Z'),
          },
        },
        update: { orderId: order.id, status: 'transferred' },
        create: {
          vendorId: vendor.id,
          orderId: order.id,
          status: 'transferred',
          amountPence: 8800,
          grossPence: 10000,
          commissionPence: 1200,
          periodStart: new Date('2030-01-01T00:00:00.000Z'),
          periodEnd: new Date('2030-01-07T00:00:00.000Z'),
          orderCount: 1,
          stripeTransferId: deterministicExternalId('tr', this.namespace, state),
          transferredAt: new Date(),
        },
      });
      identity.payoutId = payout.id;
    }
    if (state === 'V6') await this.ensureDocument(vendor.id, 'verified', 14, state);
    if (state === 'V7') {
      await this.ensureDocument(vendor.id, 'expired', -8, state);
      await this.suspendVendor(vendor.id, 'DOCUMENT_EXPIRED', state);
    }
    if (state === 'V8') {
      await this.prisma.vendor.update({
        where: { id: vendor.id },
        data: {
          status: 'suspended',
          fsaHygieneRating: 2,
          complianceStatus: 'RATED',
          suspendedAt: new Date(),
        },
      });
      await this.ensureEnforcement(vendor.id, 'FHRS_BELOW_THRESHOLD', state);
    }
    if (state === 'V10') await this.ensureTerms(vendor.id);
    if (state === 'V11')
      identity.cateringBookingId = await this.ensureCateringBooking(vendor.id, user.id, state);

    return identity;
  }

  private async createAdminState(state: AdminState): Promise<TestIdentity> {
    const role: UserRole = state === 'A3' ? 'support' : 'admin';
    const user = await this.ensureUser(state, role);
    const identity = this.identity(state, user);
    if (state === 'A2') identity.accessToken = await this.enrolAal2(user);
    return identity;
  }

  private async ensureUser(state: FactoryState, role: UserRole): Promise<FactoryUser> {
    const email = stateEmail(this.namespace, state);
    return this.ensureUserByEmail(email, role, state);
  }

  private async ensureUserByEmail(
    email: string,
    role: UserRole,
    label: string,
  ): Promise<FactoryUser> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    let userId = existing?.id;

    if (this.admin) {
      if (!this.password) {
        throw new Error(
          'TEST_FACTORY_PASSWORD_REQUIRED: set TEST_FACTORY_PASSWORD for Supabase identities.',
        );
      }
      if (userId) {
        const { error } = await this.admin.auth.admin.updateUserById(userId, {
          email_confirm: true,
          app_metadata: { role },
          user_metadata: { role, testFactory: true },
        });
        if (error) {
          throw new Error(
            `TEST_FACTORY_AUTH_PROFILE_MISMATCH: ${email} has a platform row but no matching Auth user. Teardown it before retrying.`,
          );
        }
      } else {
        const { data, error } = await this.admin.auth.admin.createUser({
          email,
          password: this.password,
          email_confirm: true,
          app_metadata: { role },
          user_metadata: { role, testFactory: true },
        });
        if (error || !data.user) {
          throw new Error(
            `TEST_FACTORY_AUTH_CREATE_FAILED: ${error?.message ?? 'no Auth user returned'}`,
          );
        }
        userId = data.user.id;
      }
    } else {
      userId ??= randomUUID();
    }

    const platformUser = await this.prisma.user.upsert({
      where: { email },
      update: { role, status: 'active', emailVerified: true },
      create: {
        id: userId,
        email,
        firstName: 'Test',
        lastName: `${label} Factory`,
        role,
        status: 'active',
        emailVerified: true,
      },
    });

    return { id: platformUser.id, email: platformUser.email, password: this.password, role };
  }

  private identity(state: FactoryState, user: FactoryUser): TestIdentity {
    return {
      state,
      credentials: { email: user.email, password: user.password, role: user.role },
      userId: user.id,
      relatedUserIds: [],
      relatedVendorIds: [],
      storageObjects: [],
    };
  }

  private async ensureVendor(identity: TestIdentity, user: FactoryUser, state: FactoryState) {
    const existing = await this.prisma.vendor.findUnique({ where: { userId: user.id } });
    const vendor =
      existing ??
      (await this.prisma.vendor.create({
        data: {
          userId: user.id,
          businessName: `Test Factory ${state} Kitchen`,
          slug: slug(this.namespace, state),
          description: 'Safe, isolated test vendor created by the Feastpot test data factory.',
          cuisines: ['Test cuisine'],
          status: state === 'V2' || state === 'V3' ? 'approved' : 'live',
          approvedAt: new Date(),
          stripeAccountId:
            state === 'V2' ? null : deterministicExternalId('acct', this.namespace, state),
          payoutsEnabled: state === 'V2' || state === 'V3' ? false : true,
          complianceStatus: 'RATED',
          fsaHygieneRating: 5,
          fsaRatingDate: new Date(),
        },
      }));

    if (!identity.relatedVendorIds.includes(vendor.id)) identity.relatedVendorIds.push(vendor.id);
    // V4 is the canonical empty vendor. It must stay free of menus and all
    // transactional data so route tests exercise genuine zero-row responses.
    if (state !== 'V4') await this.ensureMenu(vendor.id, state);
    return vendor;
  }

  private async ensureMenu(vendorId: string, state: FactoryState) {
    const name = `Test Factory ${state} Menu`;
    const existing = await this.prisma.menu.findFirst({ where: { vendorId, name } });
    return (
      existing ??
      this.prisma.menu.create({
        data: { vendorId, name, isActive: true },
      })
    );
  }

  private async ensureCompletedOrder(
    identity: TestIdentity,
    customerId: string,
    state: FactoryState,
    preferredVendorId?: string,
  ) {
    let vendorId = preferredVendorId;
    if (!vendorId) {
      const helperUser = await this.ensureUserByEmail(
        `tf-${safeKey(this.namespace)}-${state.toLowerCase()}-order-vendor@test.feastpot.co.uk`,
        'vendor',
        `Order ${state} helper`,
      );
      const helperVendor = await this.ensureVendor(identity, helperUser, state);
      vendorId = helperVendor.id;
      if (!identity.relatedUserIds.includes(helperUser.id))
        identity.relatedUserIds.push(helperUser.id);
    }
    const menu = await this.ensureMenu(vendorId, state);
    const itemName = `Test Factory ${state} Dish`;
    const item =
      (await this.prisma.menuItem.findFirst({
        where: { vendorId, menuId: menu.id, name: itemName },
      })) ??
      (await this.prisma.menuItem.create({
        data: {
          vendorId,
          menuId: menu.id,
          name: itemName,
          description: 'Test-only completed order item.',
          category: 'mains',
          pricePence: 10000,
          imageUrls: [],
          allergens: ['milk'],
          tags: [],
          isAvailable: true,
          moderationStatus: 'approved',
        },
      }));
    const number = orderNumber(this.namespace, state);
    const existing = await this.prisma.order.findUnique({ where: { orderNumber: number } });
    if (existing) return existing;

    return this.prisma.order.create({
      data: {
        orderNumber: number,
        customerId,
        vendorId,
        type: 'standard',
        status: 'delivered',
        deliveryType: 'collection',
        subtotalPence: 10000,
        totalPence: 10000,
        commissionPence: 1200,
        vendorPayoutPence: 8800,
        allergenConfirmed: true,
        acceptedAt: new Date(),
        deliveredAt: new Date(),
        items: {
          create: {
            menuItemId: item.id,
            nameSnapshot: item.name,
            quantity: 1,
            unitPence: item.pricePence,
            totalPence: item.pricePence,
          },
        },
        payments: {
          create: {
            userId: customerId,
            type: 'capture',
            status: 'succeeded',
            amountPence: 10000,
            stripePaymentIntentId: deterministicExternalId('pi', this.namespace, state),
            processedAt: new Date(),
          },
        },
      },
    });
  }

  private async ensureAddress(userId: string, state: FactoryState): Promise<void> {
    const label = `Test Factory ${state}`;
    const existing = await this.prisma.address.findFirst({ where: { userId, label } });
    if (!existing) {
      await this.prisma.address.create({
        data: {
          userId,
          label,
          line1: '1 Test Factory Way',
          city: 'London',
          postcode: 'SE15 4ST',
          country: 'GB',
          isDefault: true,
        },
      });
    }
  }

  private async ensureFeastPass(
    userId: string,
    status: FeastPassStatus,
    state: Extract<CustomerState, 'C4' | 'C5'>,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.feastPassSubscription.upsert({
      where: { userId },
      update: {
        status,
        currentPeriodEnd:
          status === 'ACTIVE'
            ? new Date(now.getTime() + 30 * 86_400_000)
            : new Date(now.getTime() - 86_400_000),
      },
      create: {
        userId,
        stripeSubscriptionId: deterministicExternalId('sub', this.namespace, state),
        stripeCustomerId: deterministicExternalId('cus', this.namespace, state),
        plan: 'MONTHLY',
        status,
        currentPeriodStart: new Date(now.getTime() - 30 * 86_400_000),
        currentPeriodEnd:
          status === 'ACTIVE'
            ? new Date(now.getTime() + 30 * 86_400_000)
            : new Date(now.getTime() - 86_400_000),
      },
    });
  }

  private async ensureDocument(
    vendorId: string,
    status: 'verified' | 'expired',
    daysFromNow: number,
    state: FactoryState,
  ): Promise<void> {
    const fileName = `test-factory-${state}-insurance.pdf`;
    const existing = await this.prisma.vendorDocument.findFirst({ where: { vendorId, fileName } });
    if (!existing) {
      await this.prisma.vendorDocument.create({
        data: {
          vendorId,
          type: 'insurance',
          status,
          fileName,
          fileUrl: `https://example.invalid/test-factory/${safeKey(this.namespace)}/${state}/insurance.pdf`,
          expiresAt: new Date(Date.now() + daysFromNow * 86_400_000),
        },
      });
    }
  }

  private async suspendVendor(
    vendorId: string,
    reasonCode: 'DOCUMENT_EXPIRED' | 'FHRS_BELOW_THRESHOLD',
    state: FactoryState,
  ): Promise<void> {
    await this.prisma.vendor.update({
      where: { id: vendorId },
      data: { status: 'suspended', suspendedAt: new Date() },
    });
    await this.ensureEnforcement(vendorId, reasonCode, state);
  }

  private async ensureEnforcement(
    vendorId: string,
    reasonCode: 'DOCUMENT_EXPIRED' | 'FHRS_BELOW_THRESHOLD',
    state: FactoryState,
  ): Promise<void> {
    const existing = await this.prisma.vendorEnforcementAction.findFirst({
      where: { vendorId, reasonCode, liftedAt: null },
    });
    if (!existing) {
      await this.prisma.vendorEnforcementAction.create({
        data: {
          vendorId,
          actionType: 'SUSPENSION',
          reasonCode,
          reasonNarrative:
            'This automated test-factory suspension exists only to exercise the vendor compliance interface safely.',
          facts: { testFactory: true, state },
          effectiveAt: new Date(),
          urgentBasis:
            'Test-only public safety scenario; never use this fixture as evidence of a real vendor breach.',
          issuedBy: 'test-factory',
        },
      });
    }
  }

  private async ensureTerms(vendorId: string): Promise<void> {
    const contentV1 = '# Test Factory Vendor Terms v1';
    const contentV2 = '# Test Factory Vendor Terms v2';
    const versionV1 = this.termsVersionLabel('v1');
    const versionV2 = this.termsVersionLabel('v2');
    const now = new Date();
    const v1 = await this.prisma.termsVersion.upsert({
      where: { documentType_version: { documentType: 'VENDOR_TERMS', version: versionV1 } },
      update: {},
      create: {
        documentType: 'VENDOR_TERMS',
        version: versionV1,
        contentMdx: contentV1,
        contentHash: sha256(contentV1),
        changeSummary: 'Stable test-only vendor terms version.',
        isMaterial: false,
        publishedAt: now,
        effectiveAt: now,
      },
    });
    await this.prisma.termsVersion.upsert({
      where: { documentType_version: { documentType: 'VENDOR_TERMS', version: versionV2 } },
      update: {},
      create: {
        documentType: 'VENDOR_TERMS',
        version: versionV2,
        contentMdx: contentV2,
        contentHash: sha256(contentV2),
        changeSummary: 'Future material test-only vendor terms version.',
        isMaterial: true,
        publishedAt: now,
        effectiveAt: new Date(now.getTime() + 16 * 86_400_000),
      },
    });
    await this.prisma.termsAcceptance.upsert({
      where: { vendorId_termsVersionId: { vendorId, termsVersionId: v1.id } },
      update: {},
      create: {
        vendorId,
        termsVersionId: v1.id,
        acceptanceText: 'I accept the test factory v1 terms.',
        contentHash: v1.contentHash,
        scrolledToEnd: true,
      },
    });
  }

  private termsVersionLabel(revision: 'v1' | 'v2'): string {
    return `tf-${sha256(this.namespace).slice(0, 20)}-${revision}`;
  }

  private async ensureCateringBooking(
    vendorId: string,
    customerId: string,
    state: Extract<VendorState, 'V11'>,
  ): Promise<string> {
    const email = stateEmail(this.namespace, state);
    const enquiry =
      (await this.prisma.cateringEnquiry.findFirst({ where: { email, source: 'test-factory' } })) ??
      (await this.prisma.cateringEnquiry.create({
        data: {
          occasionType: 'Birthday',
          guestCountBand: '20-30',
          postcode: 'SE15 4ST',
          outwardCode: 'SE15',
          contactName: 'Test Factory Customer',
          email,
          source: 'test-factory',
        },
      }));
    const booking = await this.prisma.cateringBooking.upsert({
      where: { enquiryId: enquiry.id },
      update: { status: 'CONFIRMED' },
      create: {
        enquiryId: enquiry.id,
        vendorId,
        customerId,
        customerEmail: email,
        customerName: 'Test Factory Customer',
        eventDate: new Date(Date.now() + 21 * 86_400_000),
        guestCount: 24,
        totalPence: 24000,
        depositPence: 12000,
        balancePence: 12000,
        commissionPercent: 12,
        commissionPence: 2880,
        status: 'CONFIRMED',
        quoteExpiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    return booking.id;
  }

  private async enrolAal2(user: FactoryUser): Promise<string> {
    if (!this.anon || !user.password) {
      throw new Error(
        'TEST_FACTORY_AAL2_REQUIRES_SUPABASE: configure Supabase URL, anon key, service role key, and TEST_FACTORY_PASSWORD.',
      );
    }
    const { data: signIn, error: signInError } = await this.anon.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    if (signInError || !signIn.session) {
      throw new Error(`TEST_FACTORY_AAL2_SIGN_IN_FAILED: ${signInError?.message ?? 'no session'}`);
    }

    const factors = await this.anon.auth.mfa.listFactors();
    if (factors.error)
      throw new Error(`TEST_FACTORY_AAL2_FACTORS_FAILED: ${factors.error.message}`);
    if ((factors.data?.totp?.length ?? 0) > 0) {
      throw new Error(
        'TEST_FACTORY_AAL2_ALREADY_ENROLLED: remove the existing test factor with teardown before recreating A2.',
      );
    }

    const enrolled = await this.anon.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Test Factory A2',
    });
    const enrollment = enrolled.data as unknown as {
      id?: string;
      totp?: { secret?: string };
    } | null;
    const factorId = enrollment?.id;
    const secret = enrollment?.totp?.secret;
    if (enrolled.error || !factorId || !secret) {
      throw new Error(
        `TEST_FACTORY_AAL2_ENROLL_FAILED: ${enrolled.error?.message ?? 'missing TOTP factor'}`,
      );
    }
    const challenge = await this.anon.auth.mfa.challenge({ factorId });
    if (challenge.error || !challenge.data?.id) {
      throw new Error(
        `TEST_FACTORY_AAL2_CHALLENGE_FAILED: ${challenge.error?.message ?? 'no challenge'}`,
      );
    }
    const verified = await this.anon.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code: totp(secret),
    });
    if (verified.error)
      throw new Error(`TEST_FACTORY_AAL2_VERIFY_FAILED: ${verified.error.message}`);
    const session = await this.anon.auth.getSession();
    if (!session.data.session?.access_token) throw new Error('TEST_FACTORY_AAL2_SESSION_MISSING');
    return session.data.session.access_token;
  }
}
