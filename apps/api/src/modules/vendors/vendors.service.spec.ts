import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { UserRole, VendorStatus } from '@prisma/client';

import type { AuthUser } from '../../auth/types';
import type { RedisCacheService } from '../../common/cache/redis-cache.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { StripeService } from '../../stripe/stripe.service';
import type { SupabaseStorageService } from '../catalogue/supabase-storage.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { EmailProvider } from '../notifications/providers/email.provider';
import type { VendorMembersService } from '../vendor-members/vendor-members.service';

import type { VendorRepository } from './vendors.repository';
import { VendorsService } from './vendors.service';

type RepoMock = jest.Mocked<
  Pick<
    VendorRepository,
    | 'search'
    | 'findById'
    | 'findByUserId'
    | 'findBySlug'
    | 'create'
    | 'update'
    | 'upsertDeliveryConfigMinOrder'
    | 'transitionStatus'
    | 'listPublishedReviews'
  >
>;

const makeRepo = (): RepoMock => ({
  search: jest.fn(),
  findById: jest.fn(),
  findByUserId: jest.fn(),
  findBySlug: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  upsertDeliveryConfigMinOrder: jest.fn(),
  transitionStatus: jest.fn(),
  listPublishedReviews: jest.fn(),
});

const customer: AuthUser = { id: 'u-cust', email: 'c@x.io', role: UserRole.customer };
const vendorOwner: AuthUser = { id: 'u-vend', email: 'v@x.io', role: UserRole.vendor };
const admin: AuthUser = { id: 'u-admin', email: 'a@x.io', role: UserRole.admin };
const compliance: AuthUser = { id: 'u-comp', email: 'co@x.io', role: UserRole.compliance };

const baseVendor = {
  id: 'v-1',
  userId: vendorOwner.id,
  status: VendorStatus.pending,
  businessName: 'Test',
  slug: 'test',
  description: null,
  cuisines: ['nigerian'],
  rating: 0,
  ratingCount: 0,
};

describe('VendorsService', () => {
  let repo: RepoMock;
  let service: VendorsService;
  let members: { canActOnVendor: jest.Mock; resolveVendorIdByUserId: jest.Mock };

  let prismaMock: { vendorApplication: { create: jest.Mock } };

  beforeEach(() => {
    repo = makeRepo();
    prismaMock = {
      vendorApplication: {
        create: jest.fn().mockImplementation(({ select: _select }) =>
          Promise.resolve({
            id: 'app-1',
            kitchenName: 'K',
            createdAt: new Date('2026-08-01T00:00:00Z'),
            status: 'new',
          }),
        ),
      },
    };
    const prisma = prismaMock as unknown as PrismaService;
    const stripe = {} as unknown as StripeService;
    const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      delByPattern: jest.fn().mockResolvedValue(undefined),
    } as unknown as RedisCacheService;
    const notifications = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotificationsService;
    const email = { send: jest.fn().mockResolvedValue(undefined) } as unknown as EmailProvider;
    const storage = { uploadVendorImage: jest.fn() } as unknown as SupabaseStorageService;
    members = {
      canActOnVendor: jest.fn().mockResolvedValue(true),
      resolveVendorIdByUserId: jest.fn().mockResolvedValue({ vendorId: 'v-1' }),
    };
    service = new VendorsService(
      repo as unknown as VendorRepository,
      prisma,
      stripe,
      config,
      cache,
      notifications,
      email,
      storage,
      members as unknown as VendorMembersService,
    );
  });

  describe('registerInterest', () => {
    // The service arms a real 10s timeout around each email send; with the
    // email mock resolving instantly the timer would outlive the test run
    // and trip jest's "worker failed to exit gracefully" warning. Fake
    // timers keep the timers inert (promise resolution needs no timers).
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('persists hygiene number, delivery radius and order types', async () => {
      await service.registerInterest({
        fullName: 'Ada Balogun',
        kitchenName: "Ada's Kitchen",
        email: 'Ada@Example.com',
        phone: '07123456789',
        postcode: 'se15 4ab',
        cuisineType: 'Nigerian',
        kitchenType: 'home',
        hasFoodHygieneRegistration: true,
        hygieneRegNumber: '  FHRS-123456  ',
        deliveryRadiusMiles: 15,
        orderTypes: ['family_pots', 'event_catering'],
        foodStory: 'Cooking jollof for my community for ten years.',
      });

      expect(prismaMock.vendorApplication.create).toHaveBeenCalledTimes(1);
      const { data } = prismaMock.vendorApplication.create.mock.calls[0][0];
      expect(data.hygieneRegNumber).toBe('FHRS-123456'); // trimmed
      expect(data.deliveryRadiusMiles).toBe(15);
      expect(data.orderTypes).toEqual(['family_pots', 'event_catering']);
    });

    it('defaults radius to null and orderTypes to [] when omitted', async () => {
      await service.registerInterest({
        fullName: 'Ada Balogun',
        kitchenName: "Ada's Kitchen",
        email: 'ada@example.com',
        phone: '07123456789',
        postcode: 'SE15 4AB',
        cuisineType: 'Nigerian',
        kitchenType: 'home',
        hasFoodHygieneRegistration: true,
        hygieneRegNumber: 'FHRS-123456',
        foodStory: 'Cooking jollof for my community for ten years.',
      });

      const { data } = prismaMock.vendorApplication.create.mock.calls[0][0];
      expect(data.deliveryRadiusMiles).toBeNull();
      expect(data.orderTypes).toEqual([]);
    });
  });

  describe('search', () => {
    it('returns nextCursor null when fewer rows than limit', async () => {
      repo.search.mockResolvedValue([
        {
          id: 'v1',
          business_name: 'A',
          slug: 'a',
          description: null,
          cuisines: [],
          status: VendorStatus.live,
          rating: 4.5,
          rating_count: 10,
          created_at: new Date(),
          distance_km: 0,
        },
      ] as never);
      const res = await service.search({ limit: 20 });
      expect(res.nextCursor).toBeNull();
      expect(res.data).toHaveLength(1);
      expect(res.data[0]!.businessName).toBe('A');
    });

    it('returns an opaque base64url nextCursor when page is full and decodes back to last row', async () => {
      const rows = Array.from({ length: 2 }, (_, i) => ({
        id: `00000000-0000-0000-0000-00000000000${i}`,
        business_name: `V${i}`,
        slug: `v${i}`,
        description: null,
        cuisines: [],
        status: VendorStatus.live,
        rating: 4.2,
        rating_count: i + 1,
        created_at: new Date(),
        distance_km: null,
      }));
      repo.search.mockResolvedValue(rows as never);
      const res = await service.search({ limit: 2 });
      expect(typeof res.nextCursor).toBe('string');
      expect(res.nextCursor).toMatch(/^[A-Za-z0-9_\-=]+$/);
      const decoded = JSON.parse(Buffer.from(res.nextCursor!, 'base64url').toString('utf8')) as {
        id: string;
        rating: number;
      };
      expect(decoded.id).toBe(rows[1]!.id);
      expect(decoded.rating).toBe(4.2);
    });

    it('decodes inbound cursor and forwards it to the repository', async () => {
      repo.search.mockResolvedValue([] as never);
      const cursor = Buffer.from(
        JSON.stringify({
          rating: 4.5,
          ratingCount: 10,
          distance: null,
          id: '00000000-0000-0000-0000-000000000099',
        }),
        'utf8',
      ).toString('base64url');
      await service.search({ limit: 5, cursor });
      const arg = repo.search.mock.calls[0]![1];
      expect(arg).toEqual(
        expect.objectContaining({
          rating: 4.5,
          ratingCount: 10,
          id: '00000000-0000-0000-0000-000000000099',
        }),
      );
    });
  });

  describe('findById / findMyVendor', () => {
    it('throws NotFound when vendor missing', async () => {
      repo.findById.mockResolvedValue(null as never);
      await expect(service.findById('v-x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFound when the membership-resolved vendor row is missing', async () => {
      // findMyVendor now resolves the caller's vendor via team membership
      // (members.resolveVendorIdByUserId) and then loads it by id. NotFound
      // is the resolved-but-deleted case, NOT the repo.findByUserId path.
      members.resolveVendorIdByUserId.mockResolvedValue({ vendorId: 'v-1' });
      repo.findById.mockResolvedValue(null as never);
      await expect(service.findMyVendor('u-x')).rejects.toBeInstanceOf(NotFoundException);
      expect(members.resolveVendorIdByUserId).toHaveBeenCalledWith('u-x', expect.any(Array));
    });

    it('resolves the caller vendor through team membership', async () => {
      members.resolveVendorIdByUserId.mockResolvedValue({ vendorId: 'v-1' });
      repo.findById.mockResolvedValue(baseVendor as never);
      await expect(service.findMyVendor('u-member')).resolves.toEqual(baseVendor);
      expect(members.resolveVendorIdByUserId).toHaveBeenCalledWith('u-member', expect.any(Array));
    });
  });

  describe('create', () => {
    it('creates a pending vendor with slugified name', async () => {
      repo.findByUserId.mockResolvedValue(null as never);
      repo.findBySlug.mockResolvedValue(null as never);
      repo.create.mockImplementation(async (data) => ({ id: 'new', ...data }) as never);
      const res = await service.create(customer, {
        businessName: "Maman's Kitchen!",
        cuisineTypes: ['cameroonian'],
      });
      const callArg = repo.create.mock.calls[0]![0] as unknown as {
        slug: string;
        status: VendorStatus;
        cuisines: string[];
      };
      expect(callArg.slug).toBe('maman-s-kitchen');
      expect(callArg.status).toBe(VendorStatus.pending);
      expect(callArg.cuisines).toEqual(['cameroonian']);
      expect(res).toBeDefined();
    });

    it('rejects when user already has a vendor', async () => {
      repo.findByUserId.mockResolvedValue({ id: 'v-existing' } as never);
      await expect(
        service.create(customer, { businessName: 'X', cuisineTypes: ['x'] }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('disambiguates conflicting slugs', async () => {
      repo.findByUserId.mockResolvedValue(null as never);
      repo.findBySlug
        .mockResolvedValueOnce({ id: 'a' } as never)
        .mockResolvedValueOnce({ id: 'b' } as never)
        .mockResolvedValueOnce(null as never);
      repo.create.mockImplementation(async (data) => data as never);
      await service.create(customer, { businessName: 'Test', cuisineTypes: ['x'] });
      const callArg = repo.create.mock.calls[0]![0] as unknown as { slug: string };
      expect(callArg.slug).toBe('test-2');
    });
  });

  describe('update', () => {
    it('forbids editing another vendor', async () => {
      repo.findById.mockResolvedValue({ ...baseVendor, userId: 'someone-else' } as never);
      members.canActOnVendor.mockResolvedValue(false);
      await expect(
        service.update('v-1', vendorOwner, { businessName: 'X' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('admins can edit any vendor', async () => {
      repo.findById.mockResolvedValue({ ...baseVendor, userId: 'someone-else' } as never);
      repo.update.mockResolvedValue(baseVendor as never);
      await expect(service.update('v-1', admin, { businessName: 'X' })).resolves.toBeDefined();
    });

    it('updates DeliveryConfig minOrderPence separately', async () => {
      repo.findById.mockResolvedValue(baseVendor as never);
      repo.update.mockResolvedValue(baseVendor as never);
      await service.update('v-1', vendorOwner, { minOrderPence: 1500 });
      expect(repo.upsertDeliveryConfigMinOrder).toHaveBeenCalledWith('v-1', 1500);
    });
  });

  describe('updateStatus', () => {
    it('rejects same-status update', async () => {
      repo.findById.mockResolvedValue({ ...baseVendor, status: VendorStatus.live } as never);
      await expect(
        service.updateStatus('v-1', { status: VendorStatus.live }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects illegal transition', async () => {
      repo.findById.mockResolvedValue({ ...baseVendor, status: VendorStatus.pending } as never);
      await expect(
        service.updateStatus('v-1', { status: VendorStatus.live }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when role cannot perform transition', async () => {
      // pending → approved is open to compliance OR admin (per the security
      // spec) but never to support agents - they have no business changing
      // vendor status at any stage.
      const support: AuthUser = { id: 'u-supp', email: 's@x.io', role: UserRole.support };
      repo.findById.mockResolvedValue({ ...baseVendor, status: VendorStatus.pending } as never);
      await expect(
        service.updateStatus('v-1', { status: VendorStatus.approved }, support),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('admin can also approve a pending vendor (per Step 5 of the security spec)', async () => {
      repo.findById.mockResolvedValue({ ...baseVendor, status: VendorStatus.pending } as never);
      repo.transitionStatus.mockResolvedValue({
        ...baseVendor,
        status: VendorStatus.approved,
      } as never);
      await service.updateStatus('v-1', { status: VendorStatus.approved }, admin);
      expect(repo.transitionStatus).toHaveBeenCalledWith(
        expect.objectContaining({ actorUserId: admin.id, toStatus: VendorStatus.approved }),
      );
    });

    it('compliance can approve a pending vendor', async () => {
      repo.findById.mockResolvedValue({ ...baseVendor, status: VendorStatus.pending } as never);
      repo.transitionStatus.mockResolvedValue({
        ...baseVendor,
        status: VendorStatus.approved,
      } as never);
      const res = await service.updateStatus(
        'v-1',
        { status: VendorStatus.approved, reasonCode: 'docs_ok' },
        compliance,
      );
      expect(repo.transitionStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          vendorId: 'v-1',
          fromStatus: VendorStatus.pending,
          toStatus: VendorStatus.approved,
          actorUserId: compliance.id,
          reasonCode: 'docs_ok',
        }),
      );
      expect((res as { status: VendorStatus }).status).toBe(VendorStatus.approved);
    });

    it('admin can transition live → suspended', async () => {
      repo.findById.mockResolvedValue({ ...baseVendor, status: VendorStatus.live } as never);
      repo.transitionStatus.mockResolvedValue({
        ...baseVendor,
        status: VendorStatus.suspended,
      } as never);
      await service.updateStatus('v-1', { status: VendorStatus.suspended }, admin);
      expect(repo.transitionStatus).toHaveBeenCalled();
    });

    it('admin can remove from any state except removed', async () => {
      repo.findById.mockResolvedValue({ ...baseVendor, status: VendorStatus.live } as never);
      repo.transitionStatus.mockResolvedValue({
        ...baseVendor,
        status: VendorStatus.removed,
      } as never);
      await service.updateStatus('v-1', { status: VendorStatus.removed }, admin);
      expect(repo.transitionStatus).toHaveBeenCalled();
    });
  });

  describe('getOnboardingProgress', () => {
    it('menu step requires >= 3 available items (matches onboarding copy)', async () => {
      // Bypass membership resolution - we only care about the step maths.
      jest
        .spyOn(
          service as unknown as { resolveMyVendor: (u: string, r: unknown) => Promise<unknown> },
          'resolveMyVendor',
        )
        .mockResolvedValue({ id: 'v-1' });
      const prismaMock = (
        service as unknown as {
          prisma: { vendor: { findUnique: jest.Mock }; menuItem: { count: jest.Mock } };
        }
      ).prisma;
      prismaMock.vendor = {
        findUnique: jest.fn().mockResolvedValue({
          description: 'd',
          logoUrl: 'l',
          documents: [{}, {}, {}, {}],
          stripeAccountId: 'acct_1',
          payoutsEnabled: true,
          deliveryConfig: { latitude: 51.5 },
        }),
      };
      prismaMock.menuItem = { count: jest.fn().mockResolvedValue(2) };

      const two = await service.getOnboardingProgress('u-1');
      expect(two.menuComplete).toBe(false);
      expect(two.menuItemCount).toBe(2);
      expect(two.allComplete).toBe(false);

      prismaMock.menuItem.count.mockResolvedValue(3);
      const three = await service.getOnboardingProgress('u-1');
      expect(three.menuComplete).toBe(true);
      expect(three.allComplete).toBe(true);
    });
  });

  describe('capacity CRUD (vendor_capacity)', () => {
    interface CapacityPrismaMock {
      $transaction: jest.Mock;
      $queryRaw: jest.Mock;
      vendorCapacity: { findMany: jest.Mock; upsert: jest.Mock; deleteMany: jest.Mock };
    }
    let capPrisma: CapacityPrismaMock;

    const futureIso = (daysAhead: number) => {
      const d = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
      return d.toISOString().slice(0, 10);
    };

    beforeEach(() => {
      jest
        .spyOn(
          service as unknown as { resolveMyVendor: (u: string, r: unknown) => Promise<unknown> },
          'resolveMyVendor',
        )
        .mockResolvedValue({ id: 'v-1' });
      capPrisma = (service as unknown as { prisma: CapacityPrismaMock }).prisma;
      capPrisma.vendorCapacity = {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      };
      capPrisma.$queryRaw = jest.fn().mockResolvedValue([]);
      // Interactive-transaction mock: run the callback against the same
      // mock client so we can assert what happened inside the tx.
      capPrisma.$transaction = jest
        .fn()
        .mockImplementation((fn: (tx: CapacityPrismaMock) => Promise<unknown>) => fn(capPrisma));
    });

    it('rejects past service dates', async () => {
      await expect(
        service.upsertMyCapacity('u-1', {
          serviceDate: '2020-01-01',
          capacityType: 'family_pot',
          totalSlots: 5,
        } as never),
      ).rejects.toMatchObject({ response: { code: 'SERVICE_DATE_IN_PAST' } });
      expect(capPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a cutoff after the service date', async () => {
      const date = futureIso(7);
      const cutoff = new Date(new Date(`${date}T00:00:00Z`).getTime() + 3 * 86400000);
      await expect(
        service.upsertMyCapacity('u-1', {
          serviceDate: date,
          capacityType: 'family_pot',
          totalSlots: 5,
          preorderCutoffAt: cutoff.toISOString(),
        } as never),
      ).rejects.toMatchObject({ response: { code: 'CUTOFF_AFTER_SERVICE_DATE' } });
    });

    it('upserts one row per week for repeatWeeks inside one transaction', async () => {
      await service.upsertMyCapacity('u-1', {
        serviceDate: futureIso(3),
        capacityType: 'party_tray',
        totalSlots: 8,
        repeatWeeks: 4,
      } as never);
      expect(capPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(capPrisma.vendorCapacity.upsert).toHaveBeenCalledTimes(5);
      const dates = capPrisma.vendorCapacity.upsert.mock.calls.map(
        (c) => c[0].where.vendorId_serviceDate_capacityType.serviceDate as Date,
      );
      // Each repeated date is exactly 7 days after the previous.
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i].getTime() - dates[i - 1].getTime()).toBe(7 * 86400000);
      }
    });

    it('aborts the whole batch when any locked row has more slots taken than the new cap', async () => {
      capPrisma.$queryRaw.mockResolvedValue([
        { service_date: new Date(`${futureIso(10)}T00:00:00Z`), slots_taken: 9 },
      ]);
      await expect(
        service.upsertMyCapacity('u-1', {
          serviceDate: futureIso(3),
          capacityType: 'family_pot',
          totalSlots: 5,
          repeatWeeks: 2,
        } as never),
      ).rejects.toMatchObject({ response: { code: 'SLOTS_BELOW_TAKEN' } });
      // The conflict check runs BEFORE any write - nothing is upserted.
      expect(capPrisma.vendorCapacity.upsert).not.toHaveBeenCalled();
    });

    it('scopes deletes to the resolved vendor and 404s on foreign ids', async () => {
      await service.removeMyCapacity('u-1', 'cap-1');
      expect(capPrisma.vendorCapacity.deleteMany).toHaveBeenCalledWith({
        where: { id: 'cap-1', vendorId: 'v-1' },
      });

      capPrisma.vendorCapacity.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.removeMyCapacity('u-1', 'someone-elses')).rejects.toMatchObject({
        response: { code: 'CAPACITY_NOT_FOUND' },
      });
    });

    it('lists rows from today forward with derived remainingSlots', async () => {
      const d = new Date(`${futureIso(2)}T00:00:00Z`);
      capPrisma.vendorCapacity.findMany.mockResolvedValue([
        {
          id: 'c1',
          serviceDate: d,
          capacityType: 'family_pot',
          totalSlots: 10,
          slotsTaken: 4,
          preorderCutoffAt: null,
        },
      ]);
      const rows = await service.getMyCapacity('u-1');
      expect(rows).toEqual([
        {
          id: 'c1',
          serviceDate: futureIso(2),
          capacityType: 'family_pot',
          totalSlots: 10,
          slotsTaken: 4,
          remainingSlots: 6,
          preorderCutoffAt: null,
        },
      ]);
      const where = capPrisma.vendorCapacity.findMany.mock.calls[0][0].where;
      // No upper bound: every future row must stay manageable.
      expect(where.serviceDate.lt).toBeUndefined();
      expect(where.serviceDate.gte).toBeInstanceOf(Date);
    });
  });

  describe('getVendorReviews', () => {
    it('paginates reviews and returns nextCursor when full page', async () => {
      const reviews = [
        { id: 'r1', customer: { firstName: 'Ada', lastName: 'Obi' } },
        { id: 'r2', customer: null },
      ];
      repo.listPublishedReviews.mockResolvedValue(reviews as never);
      const res = await service.getVendorReviews('v-1', { limit: 2 });
      expect(res.nextCursor).toBe('r2');
      // Raw customer name fields must NOT leak; initials are derived, with
      // 'FP' as the fallback when no name is available.
      expect(res.data).toEqual([
        { id: 'r1', customerInitials: 'AO' },
        { id: 'r2', customerInitials: 'FP' },
      ]);
    });
  });
});
