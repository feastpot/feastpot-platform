import type { ConfigService } from '@nestjs/config';
import type { SupabaseService } from '../../auth/supabase.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { StripeService } from '../../stripe/stripe.service';
import type { EmailProvider } from '../notifications/providers/email.provider';
import { AdminService } from './admin.service';
import { isTaxProfileComplete } from '../vendor-tax-profile/vendor-tax-profile.service';

const ids = ['u1', 'u2', 'u3', 'u4'];
function harness() {
  const auth = {
    listUsers: jest.fn().mockResolvedValue({ data: { users: [] }, error: null }),
    createUser: jest.fn(async ({ email }: { email: string }) => ({
      data: {
        user: {
          id: ids[
            [
              'test-vendor-nigerian@feastpot.test',
              'test-vendor-caribbean@feastpot.test',
              'test-vendor-applicant@feastpot.test',
              'test-vendor-cape-verdean@feastpot.test',
            ].indexOf(email)
          ],
        },
      },
      error: null,
    })),
    deleteUser: jest.fn().mockResolvedValue({ error: null }),
  };
  const models: any = {};
  for (const name of [
    'user',
    'vendor',
    'vendorApplication',
    'termsAcceptance',
    'vendorVerification',
    'vendorRequiredOnboardingItem',
    'vendorDocument',
    'vendorTaxProfile',
    'menu',
    'menuItem',
    'menuImport',
    'vendorCapacity',
    'cateringEnquiry',
    'cateringBooking',
    'auditLog',
  ]) {
    models[name] = {
      create: jest.fn(async ({ data }: any) => ({ id: `${name}-id`, ...data })),
      createMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    };
  }
  models.termsVersion = {
    findFirst: jest
      .fn()
      .mockResolvedValue({ id: 'terms-1', version: '2026-01', contentHash: 'hash-current' }),
  };
  const lock = jest.fn();
  const prisma: any = {
    ...models,
    $transaction: jest.fn(async (fn: any) => fn({ ...models, $executeRaw: lock })),
  };
  const service = new AdminService(
    prisma as PrismaService,
    {} as StripeService,
    { getClient: () => ({ auth: { admin: auth } }) } as SupabaseService,
    {} as EmailProvider,
    {} as ConfigService,
  );
  return { service, prisma, auth, models, lock };
}

describe('AdminService test vendor personas', () => {
  it('rejects confirmation before touching Prisma or Auth', async () => {
    const { service, prisma, auth } = harness();
    await expect(service.createTestVendorPersonas('no', 'admin')).rejects.toThrow();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(auth.createUser).not.toHaveBeenCalled();
  });
  it('requires current terms before Auth creation', async () => {
    const h = harness();
    h.prisma.termsVersion.findFirst.mockResolvedValue(null);
    await expect(
      h.service.createTestVendorPersonas('CREATE PRODUCTION TEST VENDORS', 'admin'),
    ).rejects.toThrow();
    expect(h.auth.createUser).not.toHaveBeenCalled();
  });
  it('rejects deterministic duplicates before Auth creation', async () => {
    const h = harness();
    h.prisma.user.findMany.mockResolvedValue([{ email: 'test-vendor-nigerian@feastpot.test' }]);
    await expect(
      h.service.createTestVendorPersonas('CREATE PRODUCTION TEST VENDORS', 'admin'),
    ).rejects.toThrow();
    expect(h.auth.createUser).not.toHaveBeenCalled();
  });
  it('compensates every Auth user and logs cleanup failures without passwords', async () => {
    const h = harness();
    h.prisma.$transaction.mockImplementation(async (fn: any) => {
      await fn({ ...h.models, $executeRaw: jest.fn() });
      throw new Error('db failed');
    });
    h.auth.deleteUser.mockResolvedValue({ error: { message: 'delete failed' } });
    const error = jest.spyOn((h.service as any).logger, 'error').mockImplementation();
    await expect(
      h.service.createTestVendorPersonas('CREATE PRODUCTION TEST VENDORS', 'admin'),
    ).rejects.toThrow('db failed');
    expect(h.auth.deleteUser).toHaveBeenCalledTimes(4);
    expect(error.mock.calls.join(' ')).not.toContain('password');
  });
  it('writes the fixture markers and operational contracts', async () => {
    const h = harness();
    await h.service.createTestVendorPersonas('CREATE PRODUCTION TEST VENDORS', 'admin');
    expect(h.lock).toHaveBeenCalledTimes(1);
    expect(h.lock.mock.invocationCallOrder[0]).toBeLessThan(
      h.prisma.user.findMany.mock.invocationCallOrder[0],
    );
    expect(h.models.user.create.mock.calls.every(([x]: any[]) => x.data.isTestData === true)).toBe(
      true,
    );
    expect(
      h.models.vendor.create.mock.calls.every(([x]: any[]) => x.data.isSeedData === true),
    ).toBe(true);
    expect(
      h.models.vendorApplication.create.mock.calls.every(
        ([x]: any[]) => x.data.isTestData === true,
      ),
    ).toBe(true);
    expect(h.models.termsAcceptance.create).toHaveBeenCalledTimes(3);
    expect(
      h.models.termsAcceptance.create.mock.calls.every(
        ([x]: any[]) => x.data.contentHash === 'hash-current',
      ),
    ).toBe(true);
    expect(
      h.models.vendorVerification.create.mock.calls.every(
        ([x]: any[]) => x.data.overallState === 'VERIFIED',
      ),
    ).toBe(true);
    expect(h.models.vendorTaxProfile.create).toHaveBeenCalledTimes(3);
    for (const [call] of h.models.vendorTaxProfile.create.mock.calls) {
      expect(isTaxProfileComplete(call.data)).toBe(true);
    }
    expect(h.models.menuImport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceFiles: expect.arrayContaining([
            expect.objectContaining({ kind: 'instagram-screenshot' }),
            expect.objectContaining({ kind: 'whatsapp-export' }),
          ]),
        }),
      }),
    );
    const caribbeanMenu = h.models.menuItem.create.mock.calls.find(
      ([x]: any[]) => x.data.name === 'Jerk chicken',
    );
    expect(caribbeanMenu[0].data.imageUrls).toEqual([
      'https://images.unsplash.com/photo-1601050690597-df0568f70950',
    ]);
    expect(h.models.cateringEnquiry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ASSIGNED', isTestData: true }),
      }),
    );
    expect(h.models.cateringBooking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ASSIGNED',
          totalPence: 0,
          depositPence: 0,
          balancePence: 0,
          commissionPence: 0,
        }),
      }),
    );
  });
  it('deletes reserved orphan Auth users before creating new users', async () => {
    const h = harness();
    h.auth.listUsers.mockResolvedValue({
      data: { users: [{ id: 'orphan', email: 'test-vendor-nigerian@feastpot.test' }] },
      error: null,
    });
    await h.service.createTestVendorPersonas('CREATE PRODUCTION TEST VENDORS', 'admin');
    expect(h.auth.deleteUser).toHaveBeenCalledWith('orphan');
    expect(h.auth.createUser).toHaveBeenCalledTimes(4);
  });
  it('aborts before creation when orphan deletion fails', async () => {
    const h = harness();
    h.auth.listUsers.mockResolvedValue({
      data: { users: [{ id: 'orphan', email: 'test-vendor-nigerian@feastpot.test' }] },
      error: null,
    });
    h.auth.deleteUser.mockResolvedValue({ error: { message: 'blocked' } });
    await expect(
      h.service.createTestVendorPersonas('CREATE PRODUCTION TEST VENDORS', 'admin'),
    ).rejects.toThrow('blocked');
    expect(h.auth.createUser).not.toHaveBeenCalled();
  });
});
