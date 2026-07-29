import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import type { AuthUser } from '../../auth/types';
import { RedisCacheService } from '../../common/cache/redis-cache.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseStorageService } from '../catalogue/supabase-storage.service';
import { InboxService } from '../inbox/inbox.service';

import { ReviewsService } from './reviews.service';


const customer = { id: 'u-1', role: 'customer' } as AuthUser;

describe('ReviewsService', () => {
  let service: ReviewsService;
  const prisma = {
    review: {
      aggregate: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    vendor: { update: jest.fn() },
  };
  const cache = { del: jest.fn() };
  const storage = { uploadReviewPhoto: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: PrismaService, useValue: prisma },
        { provide: InboxService, useValue: { notify: jest.fn() } },
        { provide: SupabaseStorageService, useValue: storage },
        { provide: RedisCacheService, useValue: cache },
      ],
    }).compile();
    service = module.get(ReviewsService);
  });

  describe('recalculateVendorRating', () => {
    it('updates the vendor row AND busts the cached public profile', async () => {
      prisma.review.aggregate.mockResolvedValue({ _avg: { rating: 4.5 }, _count: { _all: 2 } });
      prisma.vendor.update.mockResolvedValue({});
      const res = await service.recalculateVendorRating('v-1');
      expect(res).toEqual({ rating: 4.5, ratingCount: 2 });
      expect(prisma.vendor.update).toHaveBeenCalledWith({
        where: { id: 'v-1' },
        data: { rating: 4.5, ratingCount: 2 },
      });
      // Without this, GET /vendors/by-slug serves a stale headline rating
      // alongside fresh per-star breakdown bars.
      expect(cache.del).toHaveBeenCalledWith('vendors:profile:v-1');
    });
  });

  describe('addPhotos', () => {
    const file = {
      originalname: 'a.jpg',
      mimetype: 'image/jpeg',
      size: 100,
      buffer: Buffer.alloc(16),
    };

    it('rejects when the caller does not own the review', async () => {
      prisma.review.findUnique.mockResolvedValue({
        id: 'r-1',
        customerId: 'someone-else',
        vendorId: 'v-1',
        photoUrls: [],
      });
      await expect(service.addPhotos('r-1', [file], customer)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('enforces the 3-photo cap across existing + new photos', async () => {
      prisma.review.findUnique.mockResolvedValue({
        id: 'r-1',
        customerId: 'u-1',
        vendorId: 'v-1',
        photoUrls: ['a', 'b', 'c'],
      });
      await expect(service.addPhotos('r-1', [file], customer)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('uploads and appends photo URLs', async () => {
      prisma.review.findUnique.mockResolvedValue({
        id: 'r-1',
        customerId: 'u-1',
        vendorId: 'v-1',
        photoUrls: ['existing'],
      });
      storage.uploadReviewPhoto.mockResolvedValue({ path: 'p', publicUrl: 'new-url' });
      prisma.review.update.mockResolvedValue({ id: 'r-1', photoUrls: ['existing', 'new-url'] });
      const res = await service.addPhotos('r-1', [file], customer);
      expect(storage.uploadReviewPhoto).toHaveBeenCalledWith({
        vendorId: 'v-1',
        reviewId: 'r-1',
        file,
      });
      expect(prisma.review.update).toHaveBeenCalledWith({
        where: { id: 'r-1' },
        data: { photoUrls: ['existing', 'new-url'] },
        select: { id: true, photoUrls: true },
      });
      expect(res.photoUrls).toEqual(['existing', 'new-url']);
    });
  });
});
