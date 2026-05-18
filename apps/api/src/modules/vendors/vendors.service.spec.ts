import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole, VendorStatus } from '@prisma/client';

import type { AuthUser } from '../../auth/types';
import type { RedisCacheService } from '../../common/cache/redis-cache.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { EmailProvider } from '../notifications/providers/email.provider';
import type { PrismaService } from '../../prisma/prisma.service';
import type { StripeService } from '../../stripe/stripe.service';
import type { ConfigService } from '@nestjs/config';
import { VendorsService } from './vendors.service';
import type { VendorRepository } from './vendors.repository';

type RepoMock = jest.Mocked<Pick<
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
>>;

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

  beforeEach(() => {
    repo = makeRepo();
    const prisma = {} as unknown as PrismaService;
    const stripe = {} as unknown as StripeService;
    const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      delByPattern: jest.fn().mockResolvedValue(undefined),
    } as unknown as RedisCacheService;
    const notifications = { enqueue: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationsService;
    const email = { send: jest.fn().mockResolvedValue(undefined) } as unknown as EmailProvider;
    service = new VendorsService(
      repo as unknown as VendorRepository,
      prisma,
      stripe,
      config,
      cache,
      notifications,
      email,
    );
  });

  describe('search', () => {
    it('returns nextCursor null when fewer rows than limit', async () => {
      repo.search.mockResolvedValue([
        { id: 'v1', business_name: 'A', slug: 'a', description: null, cuisines: [], status: VendorStatus.live, rating: 4.5, rating_count: 10, created_at: new Date(), distance_km: 0 },
      ] as never);
      const res = await service.search({ limit: 20 });
      expect(res.nextCursor).toBeNull();
      expect(res.data).toHaveLength(1);
      expect(res.data[0]!.businessName).toBe('A');
    });

    it('returns an opaque base64url nextCursor when page is full and decodes back to last row', async () => {
      const rows = Array.from({ length: 2 }, (_, i) => ({
        id: `00000000-0000-0000-0000-00000000000${i}`,
        business_name: `V${i}`, slug: `v${i}`, description: null, cuisines: [],
        status: VendorStatus.live, rating: 4.2, rating_count: i + 1, created_at: new Date(), distance_km: null,
      }));
      repo.search.mockResolvedValue(rows as never);
      const res = await service.search({ limit: 2 });
      expect(typeof res.nextCursor).toBe('string');
      expect(res.nextCursor).toMatch(/^[A-Za-z0-9_\-=]+$/);
      const decoded = JSON.parse(Buffer.from(res.nextCursor!, 'base64url').toString('utf8')) as { id: string; rating: number };
      expect(decoded.id).toBe(rows[1]!.id);
      expect(decoded.rating).toBe(4.2);
    });

    it('decodes inbound cursor and forwards it to the repository', async () => {
      repo.search.mockResolvedValue([] as never);
      const cursor = Buffer.from(
        JSON.stringify({ rating: 4.5, ratingCount: 10, distance: null, id: '00000000-0000-0000-0000-000000000099' }),
        'utf8',
      ).toString('base64url');
      await service.search({ limit: 5, cursor });
      const arg = repo.search.mock.calls[0]![1];
      expect(arg).toEqual(expect.objectContaining({ rating: 4.5, ratingCount: 10, id: '00000000-0000-0000-0000-000000000099' }));
    });
  });

  describe('findById / findMyVendor', () => {
    it('throws NotFound when vendor missing', async () => {
      repo.findById.mockResolvedValue(null as never);
      await expect(service.findById('v-x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFound when user has no vendor', async () => {
      repo.findByUserId.mockResolvedValue(null as never);
      await expect(service.findMyVendor('u-x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates a pending vendor with slugified name', async () => {
      repo.findByUserId.mockResolvedValue(null as never);
      repo.findBySlug.mockResolvedValue(null as never);
      repo.create.mockImplementation(async (data) => ({ id: 'new', ...data }) as never);
      const res = await service.create(customer, { businessName: "Maman's Kitchen!", cuisineTypes: ['cameroonian'] });
      const callArg = (repo.create.mock.calls[0]![0] as unknown) as { slug: string; status: VendorStatus; cuisines: string[] };
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
      const callArg = (repo.create.mock.calls[0]![0] as unknown) as { slug: string };
      expect(callArg.slug).toBe('test-2');
    });
  });

  describe('update', () => {
    it('forbids editing another vendor', async () => {
      repo.findById.mockResolvedValue({ ...baseVendor, userId: 'someone-else' } as never);
      await expect(
        service.update('v-1', vendorOwner, { businessName: 'X' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('admins can edit any vendor', async () => {
      repo.findById.mockResolvedValue({ ...baseVendor, userId: 'someone-else' } as never);
      repo.update.mockResolvedValue(baseVendor as never);
      await expect(
        service.update('v-1', admin, { businessName: 'X' }),
      ).resolves.toBeDefined();
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
      repo.transitionStatus.mockResolvedValue({ ...baseVendor, status: VendorStatus.approved } as never);
      await service.updateStatus('v-1', { status: VendorStatus.approved }, admin);
      expect(repo.transitionStatus).toHaveBeenCalledWith(
        expect.objectContaining({ actorUserId: admin.id, toStatus: VendorStatus.approved }),
      );
    });

    it('compliance can approve a pending vendor', async () => {
      repo.findById.mockResolvedValue({ ...baseVendor, status: VendorStatus.pending } as never);
      repo.transitionStatus.mockResolvedValue({ ...baseVendor, status: VendorStatus.approved } as never);
      const res = await service.updateStatus(
        'v-1',
        { status: VendorStatus.approved, reasonCode: 'docs_ok' },
        compliance,
      );
      expect(repo.transitionStatus).toHaveBeenCalledWith(expect.objectContaining({
        vendorId: 'v-1',
        fromStatus: VendorStatus.pending,
        toStatus: VendorStatus.approved,
        actorUserId: compliance.id,
        reasonCode: 'docs_ok',
      }));
      expect((res as { status: VendorStatus }).status).toBe(VendorStatus.approved);
    });

    it('admin can transition live → suspended', async () => {
      repo.findById.mockResolvedValue({ ...baseVendor, status: VendorStatus.live } as never);
      repo.transitionStatus.mockResolvedValue({ ...baseVendor, status: VendorStatus.suspended } as never);
      await service.updateStatus('v-1', { status: VendorStatus.suspended }, admin);
      expect(repo.transitionStatus).toHaveBeenCalled();
    });

    it('admin can remove from any state except removed', async () => {
      repo.findById.mockResolvedValue({ ...baseVendor, status: VendorStatus.live } as never);
      repo.transitionStatus.mockResolvedValue({ ...baseVendor, status: VendorStatus.removed } as never);
      await service.updateStatus('v-1', { status: VendorStatus.removed }, admin);
      expect(repo.transitionStatus).toHaveBeenCalled();
    });
  });

  describe('getVendorReviews', () => {
    it('paginates reviews and returns nextCursor when full page', async () => {
      const reviews = [{ id: 'r1' }, { id: 'r2' }];
      repo.listPublishedReviews.mockResolvedValue(reviews as never);
      const res = await service.getVendorReviews('v-1', { limit: 2 });
      expect(res.nextCursor).toBe('r2');
      expect(res.data).toEqual(reviews);
    });
  });
});
