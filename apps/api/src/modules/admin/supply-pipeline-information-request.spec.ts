import { ConflictException } from '@nestjs/common';
import { VendorApplicationStatus } from '@prisma/client';

import { AdminService } from './admin.service';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const APP_ID = '22222222-2222-4222-8222-222222222222';

function application(overrides: Record<string, unknown> = {}) {
  return {
    id: APP_ID,
    status: VendorApplicationStatus.pending,
    fullName: 'Ada Lovelace',
    kitchenName: 'Ada Kitchen',
    email: 'ada@example.test',
    phone: '07123456789',
    postcode: 'SE1 1AA',
    cuisineType: 'Nigerian',
    kitchenType: 'Home kitchen',
    foodStory: 'Family recipes',
    hasFsaRegistration: false,
    hygieneRegNumber: null,
    submittedAt: new Date(),
    cuisineTypes: ['Nigerian'],
    occasionSlugs: ['weddings'],
    menuPhotoPath: 'applications/menu.jpg',
    ...overrides,
  };
}

function setup(app = application(), last: { createdAt: Date } | null = null) {
  const tx = {
    vendorApplication: {
      findUnique: jest.fn().mockResolvedValue(app),
      update: jest.fn().mockResolvedValue({}),
    },
    vendorApplicationInfoRequest: {
      findFirst: jest.fn().mockResolvedValue(last),
      create: jest
        .fn()
        .mockImplementation(({ data }) => Promise.resolve({ id: 'request-1', ...data })),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
  const email = { send: jest.fn().mockResolvedValue({ delivered: true }) };
  const service = new AdminService(
    prisma as never,
    {} as never,
    {} as never,
    email as never,
    {} as never,
  );
  return { service, tx, prisma, email };
}

describe('AdminService supply-pipeline information requests', () => {
  it('detects missing application fields, persists actor/request/audit, and emails applicant', async () => {
    const { service, tx, email } = setup(application({ phone: '', foodStory: '' }));

    const result = await service.requestVendorApplicationInformation(APP_ID, ACTOR_ID, {
      requestedItems: ['bank details'],
      message: 'Please send the requested evidence.',
    });

    expect(result.requestedItems).toEqual(expect.arrayContaining(['bank details', 'phone number']));
    expect(tx.vendorApplicationInfoRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ applicationId: APP_ID, actorId: ACTOR_ID }),
      }),
    );
    expect(tx.vendorApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: VendorApplicationStatus.information_requested }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: ACTOR_ID,
          action: 'vendor_application.information_requested',
        }),
      }),
    );
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'ada@example.test' }));
  });

  it('rejects a request within the seven-day server-side cooldown without persisting or emailing', async () => {
    const { service, tx, email } = setup(application(), {
      createdAt: new Date(Date.now() - 6 * 86_400_000),
    });

    await expect(
      service.requestVendorApplicationInformation(APP_ID, ACTOR_ID, {}),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'VENDOR_APPLICATION_CHASE_COOLDOWN' }),
    });
    expect(tx.vendorApplicationInfoRequest.create).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('returns bounded bulk per-row success, skipped cooldown, and error outcomes', async () => {
    const { service } = setup();
    jest
      .spyOn(service, 'requestVendorApplicationInformation')
      .mockResolvedValueOnce({
        applicationId: 'a',
        requestId: 'r',
        requestedItems: [],
        message: 'm',
        requestedAt: new Date(),
      })
      .mockRejectedValueOnce(new ConflictException({ code: 'VENDOR_APPLICATION_CHASE_COOLDOWN' }))
      .mockRejectedValueOnce(new Error('record unavailable'));

    const result = await service.bulkRequestVendorApplicationInformation(
      { applicationIds: ['a', 'b', 'c'], requestedItems: ['FSA number'] },
      ACTOR_ID,
    );

    expect(result).toMatchObject({ succeeded: 1, failed: 2 });
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ applicationId: 'a', ok: true, outcome: 'success' }),
        expect.objectContaining({ applicationId: 'b', ok: false, outcome: 'skipped' }),
        expect.objectContaining({
          applicationId: 'c',
          ok: false,
          outcome: 'error',
          error: 'record unavailable',
        }),
      ]),
    );
  });
});
