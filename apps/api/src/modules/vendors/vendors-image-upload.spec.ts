/**
 * Unit tests for VendorsService.uploadIdentityImage (T005).
 *
 * Verifies that:
 *   - the returned public URL is written back onto the vendor row
 *     (logoUrl for kind='logo', coverImageUrl for kind='cover')
 *   - the vendor profile cache is invalidated after every upload
 *   - ownership is enforced (vendor owner + admin allowed; other vendor blocked)
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import type { Queue } from 'bull';

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

// ── fixtures ──────────────────────────────────────────────────────────────────

const vendorOwner: AuthUser = { id: 'u-owner', email: 'owner@x.io', role: UserRole.vendor };
const otherVendor: AuthUser = { id: 'u-other', email: 'other@x.io', role: UserRole.vendor };
const adminUser: AuthUser = { id: 'u-admin', email: 'admin@x.io', role: UserRole.admin };

const baseVendor = {
  id: 'v-1',
  userId: vendorOwner.id,
  status: 'live' as const,
  businessName: 'Mama Kitchen',
  slug: 'mama-kitchen',
  description: null,
  cuisines: ['Nigerian'],
  rating: 0,
  ratingCount: 0,
};

/** Minimal 1×1 white JPEG in a Buffer so the file shape is realistic. */
const fixtureFile = {
  originalname: 'logo.jpg',
  mimetype: 'image/jpeg',
  size: 512,
  buffer: Buffer.from(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARC' +
    'AABAAEDASIA',
    'base64',
  ),
};

// ── helpers ───────────────────────────────────────────────────────────────────

function makeService() {
  const repo: jest.Mocked<
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
  > = {
    search: jest.fn(),
    findById: jest.fn(),
    findByUserId: jest.fn(),
    findBySlug: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsertDeliveryConfigMinOrder: jest.fn(),
    transitionStatus: jest.fn(),
    listPublishedReviews: jest.fn(),
  };

  const storage = {
    uploadVendorImage: jest.fn(),
  } as unknown as jest.Mocked<SupabaseStorageService>;

  const cache: jest.Mocked<
    Pick<RedisCacheService, 'get' | 'set' | 'del' | 'delByPattern'>
  > = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    delByPattern: jest.fn().mockResolvedValue(undefined),
  };

  const members = {
    canActOnVendor: jest.fn().mockResolvedValue(true),
    resolveVendorIdByUserId: jest.fn().mockResolvedValue({ vendorId: 'v-1' }),
  };

  const service = new VendorsService(
    repo as unknown as VendorRepository,
    {} as unknown as PrismaService,
    {} as unknown as StripeService,
    { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
    cache as unknown as RedisCacheService,
    { enqueue: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationsService,
    { send: jest.fn().mockResolvedValue(undefined) } as unknown as EmailProvider,
    storage,
    members as unknown as VendorMembersService,
    { add: jest.fn().mockResolvedValue(undefined) } as unknown as Queue,
  );

  return { service, repo, storage, cache };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('VendorsService.uploadIdentityImage', () => {
  it('writes the returned publicUrl to logoUrl and clears the vendor cache', async () => {
    const { service, repo, storage, cache } = makeService();
    const publicUrl =
      'https://project.supabase.co/storage/v1/object/public/feastpot-media/vendors/v-1/identity/logo/123-logo.jpg';

    repo.findById.mockResolvedValue(baseVendor as never);
    (storage.uploadVendorImage as jest.Mock).mockResolvedValue({
      path: 'vendors/v-1/identity/logo/123-logo.jpg',
      publicUrl,
    });
    repo.update.mockResolvedValue({ ...baseVendor, logoUrl: publicUrl } as never);

    const result = await service.uploadIdentityImage('v-1', vendorOwner, 'logo', fixtureFile);

    expect(result.publicUrl).toBe(publicUrl);

    // URL must be persisted on the vendor row.
    expect(repo.update).toHaveBeenCalledWith('v-1', { logoUrl: publicUrl });

    // Profile cache must be busted so the next request sees the new logo.
    expect(cache.del).toHaveBeenCalledWith('vendors:profile:v-1');
    expect(cache.delByPattern).toHaveBeenCalledWith('vendors:search:*');
  });

  it('writes the returned publicUrl to coverImageUrl for kind="cover"', async () => {
    const { service, repo, storage } = makeService();
    const publicUrl =
      'https://project.supabase.co/storage/v1/object/public/feastpot-media/vendors/v-1/identity/cover/123-cover.jpg';

    repo.findById.mockResolvedValue(baseVendor as never);
    (storage.uploadVendorImage as jest.Mock).mockResolvedValue({ path: 'x', publicUrl });
    repo.update.mockResolvedValue({ ...baseVendor, coverImageUrl: publicUrl } as never);

    await service.uploadIdentityImage('v-1', vendorOwner, 'cover', fixtureFile);

    expect(repo.update).toHaveBeenCalledWith('v-1', { coverImageUrl: publicUrl });
  });

  it('admin can upload for any vendor', async () => {
    const { service, repo, storage } = makeService();
    const publicUrl = 'https://example.supabase.co/logo.jpg';

    repo.findById.mockResolvedValue(baseVendor as never);
    (storage.uploadVendorImage as jest.Mock).mockResolvedValue({ path: 'x', publicUrl });
    repo.update.mockResolvedValue(baseVendor as never);

    // adminUser.id !== baseVendor.userId — must still succeed.
    await expect(
      service.uploadIdentityImage('v-1', adminUser, 'logo', fixtureFile),
    ).resolves.not.toThrow();
  });

  it('blocks a vendor who does not own the listing', async () => {
    const { service, repo } = makeService();

    repo.findById.mockResolvedValue(baseVendor as never); // userId = 'u-owner'

    // otherVendor.id !== baseVendor.userId and not an admin.
    await expect(
      service.uploadIdentityImage('v-1', otherVendor, 'logo', fixtureFile),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws NotFoundException when no vendor row exists', async () => {
    const { service, repo } = makeService();
    repo.findById.mockResolvedValue(null);

    await expect(
      service.uploadIdentityImage('v-no-such', vendorOwner, 'logo', fixtureFile),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
