import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Queue } from 'bull';

import type { RedisCacheService } from '../../common/cache/redis-cache.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { StripeService } from '../../stripe/stripe.service';
import type { SupabaseStorageService } from '../catalogue/supabase-storage.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { EmailProvider } from '../notifications/providers/email.provider';
import type { TermsService } from '../terms/terms.service';
import type { VendorMembersService } from '../vendor-members/vendor-members.service';

import type { VendorOnboardingService } from './vendor-onboarding.service';
import type { VendorRepository } from './vendors.repository';
import { VendorsService } from './vendors.service';

describe('VendorsService two-phase application drafts', () => {
  const applications = new Map<string, Record<string, unknown>>();
  let service: VendorsService;
  let queue: { add: jest.Mock };

  beforeEach(() => {
    applications.clear();
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    const vendorApplication = {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: '11111111-1111-4111-8111-111111111111',
          status: 'pending',
          createdAt: new Date('2026-09-10T10:00:00Z'),
          updatedAt: new Date('2026-09-10T10:00:00Z'),
          submittedAt: null,
          cuisineTypes: [],
          occasionSlugs: [],
          menuPhotoUrl: null,
          menuBuildFromPhoto: false,
          ...data,
        };
        applications.set(String(row.id), row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id) return applications.get(String(where.id)) ?? null;
        return (
          [...applications.values()].find((row) => row.resumeTokenHash === where.resumeTokenHash) ??
          null
        );
      }),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const current = applications.get(where.id);
          if (!current) throw new Error('missing fixture');
          const next = { ...current, ...data, updatedAt: new Date('2026-09-10T10:01:00Z') };
          applications.set(where.id, next);
          return next;
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; submittedAt?: null };
          data: Record<string, unknown>;
        }) => {
          const current = applications.get(where.id);
          if (!current || (where.submittedAt === null && current.submittedAt)) return { count: 0 };
          applications.set(where.id, {
            ...current,
            ...data,
            updatedAt: new Date('2026-09-10T10:01:00Z'),
          });
          return { count: 1 };
        },
      ),
      findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => {
        const row = applications.get(where.id);
        if (!row) throw new Error('missing fixture');
        return row;
      }),
    };
    const prisma = {
      vendorApplication,
      vendorReferralLink: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    service = new VendorsService(
      {} as VendorRepository,
      prisma,
      {} as StripeService,
      {
        get: jest.fn((key: string) =>
          key === 'WEB_URL' ? 'https://www.feastpot.co.uk' : undefined,
        ),
      } as unknown as ConfigService,
      {} as RedisCacheService,
      {} as NotificationsService,
      {} as EmailProvider,
      {
        promoteVendorApplicationMenuImage: jest.fn().mockResolvedValue({
          path: 'vendor-applications/app-1/menu/menu.jpg',
          publicUrl: 'https://storage.example/menu.jpg',
        }),
        removePrivateImage: jest.fn().mockResolvedValue(undefined),
        removePublicImage: jest.fn().mockResolvedValue(undefined),
      } as unknown as SupabaseStorageService,
      {} as VendorMembersService,
      {} as TermsService,
      queue as unknown as Queue,
      {} as VendorOnboardingService,
    );
  });

  async function createDraft() {
    return service.createApplicationDraft({
      firstName: ' Ada ',
      email: 'ADA@EXAMPLE.COM',
      mobileNumber: ' 07123456789 ',
      postcode: ' se1 1aa ',
    });
  }

  it('creates the recoverable lead immediately after Phase 1 and emails its resume link', async () => {
    const result = await createDraft();
    const row = applications.get(result.id)!;

    expect(row).toMatchObject({
      fullName: 'Ada',
      email: 'ada@example.com',
      phone: '07123456789',
      postcode: 'SE1 1AA',
      kitchenName: '',
      submittedAt: null,
      currentStep: 'phase_2_business_name',
    });
    expect(result.resumeToken).toHaveLength(43);
    expect(row.resumeTokenHash).not.toBe(result.resumeToken);
    expect(queue.add).toHaveBeenCalledWith(
      'vendor_application_email_raw',
      expect.objectContaining({
        to: 'ada@example.com',
        html: expect.stringContaining('Continue my application'),
      }),
      expect.any(Object),
    );
  });

  it('persists Phase 2 fields independently and restores the exact position', async () => {
    const { resumeToken } = await createDraft();
    await service.updateApplicationDraft(resumeToken, {
      kitchenName: 'Ada Kitchen',
      currentStep: 'phase_2_cuisines',
    });
    await service.updateApplicationDraft(resumeToken, {
      cuisineTypes: ['Nigerian', 'Ghanaian'],
      currentStep: 'phase_2_menu',
    });

    await expect(service.getApplicationDraft(resumeToken)).resolves.toMatchObject({
      kitchenName: 'Ada Kitchen',
      cuisineTypes: ['Nigerian', 'Ghanaian'],
      currentStep: 'phase_2_menu',
    });
  });

  it.each([
    'phase_1',
    'phase_2_business_name',
    'phase_2_cuisines',
    'phase_2_menu',
    'phase_2_allergens',
    'phase_2_occasions',
    'phase_2_documents',
  ])('resumes an abandoned application at the exact %s step', async (currentStep) => {
    const { resumeToken } = await createDraft();
    await service.updateApplicationDraft(resumeToken, { currentStep });

    await expect(service.getApplicationDraft(resumeToken)).resolves.toMatchObject({ currentStep });
  });

  it('stops recovery at submission and rejects writes through an old resume link', async () => {
    const { resumeToken } = await createDraft();
    await service.updateApplicationDraft(resumeToken, {
      kitchenName: 'Ada Kitchen',
      cuisineTypes: ['Nigerian'],
      occasionSlugs: ['wedding-and-events'],
      menuBuildFromPhoto: true,
      currentStep: 'phase_2_occasions',
    });
    await service.attachApplicationDraftMenuPhoto(
      resumeToken,
      'vendor-applications/app-1/menu/menu.jpg',
      'https://storage.example/menu.jpg',
    );
    await service.submitApplicationDraft(resumeToken);

    await expect(
      service.updateApplicationDraft(resumeToken, { currentStep: 'phase_2_documents' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'APPLICATION_ALREADY_SUBMITTED' }),
    });
    await expect(service.getApplicationDraft(resumeToken)).resolves.toMatchObject({
      currentStep: 'submitted',
      submittedAt: expect.any(Date),
    });
  });

  it('keeps incomplete drafts out of submission and promotes a complete draft', async () => {
    const { resumeToken } = await createDraft();
    await expect(service.submitApplicationDraft(resumeToken)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    await service.updateApplicationDraft(resumeToken, {
      kitchenName: 'Ada Kitchen',
      cuisineTypes: ['Nigerian'],
      occasionSlugs: ['wedding-and-events'],
      menuBuildFromPhoto: true,
      currentStep: 'phase_2_occasions',
    });
    await service.attachApplicationDraftMenuPhoto(
      resumeToken,
      'vendor-applications/app-1/menu/menu.jpg',
      'https://storage.example/menu.jpg',
    );
    await expect(service.submitApplicationDraft(resumeToken)).resolves.toMatchObject({
      status: 'pending',
      kitchenName: 'Ada Kitchen',
      submittedAt: expect.any(Date),
    });

    await expect(service.getApplicationDraft(resumeToken)).resolves.toMatchObject({
      submittedAt: expect.any(Date),
      currentStep: 'submitted',
    });
  });
});
