import { CateringEnquiryExpiryService } from './catering-enquiry-expiry.service';

describe('CateringEnquiryExpiryService', () => {
  function setup(candidates: Array<Record<string, unknown>>, updateCount = 1) {
    const tx = {
      cateringEnquiry: { updateMany: jest.fn().mockResolvedValue({ count: updateCount }) },
      notificationOutbox: { create: jest.fn().mockResolvedValue({ id: 'outbox-1' }) },
    };
    const prisma = {
      cateringEnquiry: { findMany: jest.fn().mockResolvedValue(candidates) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const notifications = {
      createTransactionalOutbox: jest
        .fn()
        .mockImplementation((_tx, _event, _payload, _jobId) => tx.notificationOutbox.create()),
      dispatchTransactionalOutbox: jest.fn().mockResolvedValue(undefined),
    };
    return {
      service: new CateringEnquiryExpiryService(prisma as never, notifications as never),
      prisma,
      tx,
      notifications,
    };
  }

  it('expires a past, unassigned enquiry and creates one deterministic durable notification', async () => {
    const { service, tx, notifications } = setup([
      {
        id: 'enquiry-1',
        status: 'NEW',
        email: 'customer@example.com',
        contactName: 'Ada',
        eventDate: '2020-01-01',
      },
    ]);

    await service.expirePastEventDateEnquiries();

    expect(tx.cateringEnquiry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'NEW', booking: { is: null } }),
        data: expect.objectContaining({
          status: 'EXPIRED',
          expiryReason: 'EVENT_DATE_PASSED_UNASSIGNED',
        }),
      }),
    );
    expect(notifications.createTransactionalOutbox).toHaveBeenCalledWith(
      tx,
      'catering_enquiry_expired',
      expect.objectContaining({ recipientEmail: 'customer@example.com', enquiryId: 'enquiry-1' }),
      'catering_enquiry_expired:enquiry-1',
    );
    expect(notifications.dispatchTransactionalOutbox).toHaveBeenCalledTimes(1);
  });

  it('does not notify when a concurrent assignment wins the conditional claim', async () => {
    const { service, notifications } = setup(
      [
        {
          id: 'enquiry-1',
          status: 'UNASSIGNED',
          email: 'customer@example.com',
          contactName: 'Ada',
          eventDate: '2020-01-01',
        },
      ],
      0,
    );

    await service.expirePastEventDateEnquiries();

    expect(notifications.createTransactionalOutbox).not.toHaveBeenCalled();
    expect(notifications.dispatchTransactionalOutbox).not.toHaveBeenCalled();
  });

  it('does not recreate the outbox notification on a rerun after expiry', async () => {
    const candidate = {
      id: 'enquiry-1',
      status: 'NEW',
      email: 'customer@example.com',
      contactName: 'Ada',
      eventDate: '2020-01-01',
    };
    const { service, prisma, notifications } = setup([candidate]);
    prisma.cateringEnquiry.findMany.mockResolvedValueOnce([candidate]).mockResolvedValueOnce([]);

    await service.expirePastEventDateEnquiries();
    await service.expirePastEventDateEnquiries();

    expect(notifications.createTransactionalOutbox).toHaveBeenCalledTimes(1);
    expect(notifications.dispatchTransactionalOutbox).toHaveBeenCalledTimes(1);
  });

  it('retains ambiguous dates without fulfilment changes and asks Prisma only for unassigned statuses', async () => {
    const { service, prisma, tx } = setup([
      {
        id: 'ambiguous',
        status: 'NEW',
        email: 'customer@example.com',
        contactName: 'Ada',
        eventDate: '01/01/2020',
      },
    ]);

    await service.expirePastEventDateEnquiries();

    expect(tx.cateringEnquiry.updateMany).not.toHaveBeenCalled();
    expect(prisma.cateringEnquiry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { in: ['NEW', 'UNASSIGNED'] }, booking: { is: null } },
      }),
    );
  });
});
