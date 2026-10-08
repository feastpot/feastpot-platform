import * as Sentry from '@sentry/nestjs';

import { NotificationProcessor } from './notification.processor';
import { alertIfStubInProduction } from './providers/stub-alert';
import { TEMPLATES } from './templates';

jest.mock('@sentry/nestjs', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

type Mock = jest.Mock;

function makePrisma(user: Record<string, unknown> | null) {
  return {
    user: { findUnique: jest.fn().mockResolvedValue(user) as Mock },
    notificationPreference: { findMany: jest.fn().mockResolvedValue([]) as Mock },
    notification: {
      create: jest.fn().mockResolvedValue({ id: 'n-1' }) as Mock,
      findFirst: jest.fn().mockResolvedValue(null) as Mock,
    },
    order: { findUnique: jest.fn() as Mock },
    vendor: {
      findUnique: jest.fn().mockResolvedValue({ application: { marketingConsent: true } }) as Mock,
    },
    // Suppression check: default to not suppressed.
    emailEvent: { findFirst: jest.fn().mockResolvedValue(null) as Mock },
  };
}

function makeProviders() {
  return {
    email: { send: jest.fn().mockResolvedValue({ id: 'e-1', delivered: true }) as Mock },
    whatsapp: { send: jest.fn().mockResolvedValue({ id: 'w-1', delivered: true }) as Mock },
    push: { send: jest.fn().mockResolvedValue({ delivered: 1, failed: 0 }) as Mock },
    sms: { send: jest.fn().mockResolvedValue({ sid: 's-1', delivered: true }) as Mock },
  };
}

function makeProcessor(prisma: ReturnType<typeof makePrisma>, providers = makeProviders()) {
  const queue = { enqueue: jest.fn() };
  const processor = new NotificationProcessor(
    prisma as any,
    providers.email as any,
    providers.whatsapp as any,
    providers.push as any,
    providers.sms as any,
    queue as any,
  );
  return { processor, providers, queue };
}

const vendorUser = {
  id: 'vendor-user-1',
  email: 'vendor@example.com',
  phone: '+447700900000',
  phoneVerified: true,
  firstName: 'Priya',
};

describe('NotificationProcessor - raw email evidence', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retains the provider message ID in the completed job result', async () => {
    const { processor, providers } = makeProcessor(makePrisma(null));
    const result = await processor.handle({
      id: 'isolated-diagnostic',
      name: 'vendor_application_email_raw',
      data: { to: 'founder@example.com', subject: 'Diagnostic', html: '<p>Diagnostic</p>' },
    } as any);
    expect(result).toEqual({ sent: ['email'], skipped: [], providerMessageId: 'e-1' });
    expect(providers.email.send).toHaveBeenCalledTimes(1);
    expect(providers.whatsapp.send).not.toHaveBeenCalled();
  });

  it('does not claim a provider ID when the email provider is stubbed', async () => {
    const { processor, providers } = makeProcessor(makePrisma(null));
    providers.email.send.mockResolvedValue({ id: null, delivered: false });
    const result = await processor.handle({
      id: 'isolated-stub',
      name: 'vendor_application_email_raw',
      data: { to: 'founder@example.com', subject: 'Diagnostic', html: '<p>Diagnostic</p>' },
    } as any);
    expect(result).toEqual({ sent: [], skipped: [] });
  });
});

describe('NotificationProcessor - notify_vendor', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves the recipient via vendorUserId and dispatches email + push', async () => {
    const prisma = makePrisma(vendorUser);
    const { processor, providers } = makeProcessor(prisma);

    const job = {
      name: 'notify_vendor',
      data: { vendorUserId: 'vendor-user-1', orderNumber: 'FP-1234', totalPence: 4550 },
    };

    const result = await processor.handle(job as any);

    // Recipient lookup used the vendorUserId from the payload.
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'vendor-user-1' } }),
    );

    // Both channels dispatched.
    expect(providers.email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'vendor@example.com',
        subject: expect.stringContaining('FP-1234'),
      }),
    );
    expect(providers.push.send).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'vendor-user-1' }),
    );
    // notify_vendor never goes out via whatsapp/sms.
    expect(providers.whatsapp.send).not.toHaveBeenCalled();
    expect(providers.sms.send).not.toHaveBeenCalled();

    expect(result.sent).toEqual(expect.arrayContaining(['email', 'push']));
    expect(result.skipped).toEqual([]);
  });

  it('drops the job (no throw) when no recipient can be resolved', async () => {
    const prisma = makePrisma(vendorUser);
    const { processor, providers } = makeProcessor(prisma);

    const result = await processor.handle({
      name: 'notify_vendor',
      data: { orderNumber: 'FP-1234' },
    } as any);

    expect(result).toEqual({ sent: [], skipped: [] });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(providers.email.send).not.toHaveBeenCalled();
    expect(providers.push.send).not.toHaveBeenCalled();
  });
});

describe('notification audit delivery gaps', () => {
  it.each([false, null, undefined])(
    'recovery email requires positive consent, not %s',
    async (marketingConsent) => {
      const prisma = makePrisma(vendorUser);
      prisma.vendor.findUnique.mockResolvedValue({ application: { marketingConsent } });
      const { processor, providers } = makeProcessor(prisma);
      const result = await processor.handle({
        name: 'vendor_onboarding_recovery',
        data: { userId: vendorUser.id, deliveryChannel: 'email' },
      } as never);
      expect(result).toEqual({ sent: [], skipped: ['email'] });
      expect(providers.email.send).not.toHaveBeenCalled();
    },
  );

  it('recovery SMS checks current phone verification at delivery', async () => {
    const { processor, providers } = makeProcessor(
      makePrisma({ ...vendorUser, phoneVerified: false }),
    );
    expect(
      await processor.handle({
        name: 'vendor_onboarding_recovery',
        data: { userId: vendorUser.id, deliveryChannel: 'sms' },
      } as never),
    ).toEqual({ sent: [], skipped: ['sms'] });
    expect(providers.sms.send).not.toHaveBeenCalled();
  });
  it.each(Object.keys(TEMPLATES))(
    'dispatch contract: %s reaches the email adapter with opted-in fixture channels',
    async (name) => {
      const prisma = makePrisma(vendorUser);
      prisma.notificationPreference.findMany.mockResolvedValue(
        ['email', 'sms', 'whatsapp', 'push'].map((channel) => ({ channel, enabled: true })),
      );
      const { processor, providers } = makeProcessor(prisma);
      const result = await processor.handle({
        id: `contract:${name}`,
        name,
        data: {
          userId: vendorUser.id,
          email: 'controlled-fixture@example.test',
          recipientEmail: 'controlled-fixture@example.test',
          firstName: 'Test',
          orderId: 'fixture-order',
          orderNumber: 'FP-FIXTURE',
          amountPence: 10_000,
          depositPence: 3_000,
          balancePence: 7_000,
          netPayoutPence: 9_000,
          eventDate: '2026-10-10',
          bookingId: 'fixture-booking',
          customerName: 'Test Customer',
          statementUrl: 'https://vendor.feastpot.co.uk/payouts',
        },
      } as never);
      expect(result.sent).toContain('email');
      expect(providers.email.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.any(String),
          html: expect.stringContaining('Notification preferences'),
        }),
      );
    },
  );

  it.each([
    [
      'catering_deposit_received',
      { depositPence: 10_000, balancePence: 20_000, balanceChargeDate: '10 October 2026' },
    ],
    [
      'catering_completed',
      { customerName: 'Test Customer', eventDate: '2026-10-10', netPayoutPence: 27_000 },
    ],
    [
      'payout_transferred',
      { amountPence: 27_000, periodStart: '1 October', periodEnd: '7 October' },
    ],
  ])('%s sends vendor email and retains the provider acceptance ID', async (name, payload) => {
    const prisma = makePrisma(vendorUser);
    const { processor, providers } = makeProcessor(prisma);
    const result = await processor.handle({
      id: `audit:${name}`,
      name,
      data: { userId: vendorUser.id, ...payload },
    } as never);
    expect(result.sent).toContain('email');
    expect(providers.email.send).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        template: name,
        channel: 'email',
        status: 'sent',
        metadata: expect.objectContaining({ providerMessageId: 'e-1' }),
      }),
    });
  });

  const deliveredOrder = () => ({
    id: 'review-order',
    customerId: 'real-order-customer',
    orderNumber: 'FP-REVIEW',
    status: 'delivered',
    deliveredAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    vendor: { businessName: 'Test Kitchen' },
    reviews: [],
  });

  it('review_trigger enqueues review_request for the actual order customer', async () => {
    const prisma = makePrisma(vendorUser);
    prisma.order.findUnique.mockResolvedValue(deliveredOrder());
    const { processor, queue } = makeProcessor(prisma);
    await processor.handle({
      name: 'review_trigger',
      data: { orderId: 'review-order', userId: 'untrusted-payload-recipient' },
    } as never);
    expect(queue.enqueue).toHaveBeenCalledWith(
      'review_request',
      {
        userId: 'real-order-customer',
        orderId: 'review-order',
        orderNumber: 'FP-REVIEW',
        vendorName: 'Test Kitchen',
      },
      { jobId: 'review_request:review-order' },
    );
  });

  it.each([
    ['missing', null],
    ['cancelled', { status: 'cancelled' }],
    ['refunded', { status: 'refunded' }],
    ['already reviewed', { reviews: [{ id: 'review' }] }],
    ['too recent', { deliveredAt: new Date() }],
    ['stale', { deliveredAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) }],
  ])('review_trigger does not request a review for an order that is %s', async (_, overrides) => {
    const prisma = makePrisma(vendorUser);
    prisma.order.findUnique.mockResolvedValue(
      overrides === null ? null : { ...deliveredOrder(), ...overrides },
    );
    const { processor, queue } = makeProcessor(prisma);
    await processor.handle({ name: 'review_trigger', data: { orderId: 'review-order' } } as never);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('review_trigger skips a review request already accepted by a provider', async () => {
    const prisma = makePrisma(vendorUser);
    prisma.order.findUnique.mockResolvedValue(deliveredOrder());
    prisma.notification.findFirst.mockResolvedValue({ id: 'sent-notice' });
    const { processor, queue } = makeProcessor(prisma);
    await processor.handle({ name: 'review_trigger', data: { orderId: 'review-order' } } as never);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it.each(['referral_rewarded', 'points_expired'])(
    '%s is an explicit non-messaging loyalty-ledger event',
    async (name) => {
      const { processor, providers } = makeProcessor(makePrisma(vendorUser));
      expect(await processor.handle({ name, data: {} } as never)).toEqual({
        sent: [],
        skipped: [],
      });
      expect(providers.email.send).not.toHaveBeenCalled();
    },
  );
});

describe('NotificationProcessor - catering enquiry expiry', () => {
  it('renders the public-intake expiry template to its explicit email recipient only', async () => {
    const prisma = makePrisma(null);
    const { processor, providers } = makeProcessor(prisma);

    const result = await processor.handle({
      name: 'catering_enquiry_expired',
      data: {
        recipientEmail: 'caterer@example.com',
        contactName: 'Ada',
        enquiryId: 'ce-1',
        eventDate: '2020-01-01',
      },
    } as any);

    expect(result).toEqual({ sent: ['email'], skipped: [], providerMessageId: 'e-1' });
    expect(providers.email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'caterer@example.com',
        subject: 'Your catering enquiry has expired',
        html: expect.stringContaining('2020-01-01'),
      }),
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(providers.whatsapp.send).not.toHaveBeenCalled();
  });
});

describe('NotificationProcessor - WhatsApp order_confirmation params', () => {
  beforeEach(() => jest.clearAllMocks());

  const customer = {
    id: 'cust-1',
    email: 'jo@example.com',
    phone: '+447700900001',
    firstName: 'Jo',
  };

  async function runOrderConfirmation(data: Record<string, unknown>) {
    const prisma = makePrisma(customer);
    // whatsapp is opt-in (defaultEnabled=false) for order_confirmation, so the
    // recipient has an explicit stored preference enabling it.
    prisma.notificationPreference.findMany.mockResolvedValue([
      { channel: 'whatsapp', enabled: true },
    ]);
    const { processor, providers } = makeProcessor(prisma);
    await processor.handle({
      name: 'order_confirmation',
      data: { userId: 'cust-1', ...data },
    } as any);
    expect(providers.whatsapp.send).toHaveBeenCalledTimes(1);
    return providers.whatsapp.send.mock.calls[0][0] as {
      to: string;
      template: string;
      params: Array<string | number>;
    };
  }

  // The approved Twilio/Meta body for order_confirmation has exactly TWO
  // slots ({{1}} name, {{2}} order number) - no amount slot. Meta rejects
  // sends whose param count doesn't match, so the builder must ignore any
  // amount fields present on the job payload.
  it('sends exactly the two approved slots: name and order number', async () => {
    const call = await runOrderConfirmation({ orderNumber: 'FP-9', totalPence: 4550 });
    expect(call.template).toBe('order_confirmation');
    expect(call.params).toEqual(['Jo', 'FP-9']);
  });

  it('ignores amountPence too - param count stays at 2', async () => {
    const call = await runOrderConfirmation({
      orderNumber: 'FP-9',
      totalPence: 4550,
      amountPence: 1200,
    });
    expect(call.params).toEqual(['Jo', 'FP-9']);
  });

  it('never renders "undefined"/NaN in any slot', async () => {
    const call = await runOrderConfirmation({ orderNumber: 'FP-9' });
    expect(call.params).toHaveLength(2);
    for (const p of call.params) {
      expect(String(p)).not.toMatch(/undefined|null|NaN/);
    }
  });

  it('registers and executes the explicit order_confirmation Bull callback', async () => {
    const prisma = makePrisma(customer);
    const { processor, providers } = makeProcessor(prisma);
    const registered = (processor as any).handle_order_confirmation;
    expect(registered).toEqual(expect.any(Function));

    const result = await registered.call(processor, {
      name: 'order_confirmation',
      data: { userId: customer.id, orderNumber: 'FP-9', vendorName: 'Kitchen', totalPence: 500 },
    });
    expect(result.sent).toContain('email');
    expect(providers.email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('Kitchen'),
        html: expect.any(String),
      }),
    );
  });
});

describe('alertIfStubInProduction', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.clearAllMocks();
  });

  function makeLogger() {
    return { error: jest.fn(), warn: jest.fn() };
  }

  it('logs an error and reports to Sentry in production', () => {
    process.env.NODE_ENV = 'production';
    const logger = makeLogger();

    alertIfStubInProduction(logger as any, 'Email (Resend)', 'RESEND_API_KEY not set');

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('PRODUCTION MISCONFIGURATION'),
    );
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Email (Resend)'));
    expect(logger.warn).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('Email (Resend)'),
      expect.objectContaining({
        level: 'error',
        extra: { channel: 'Email (Resend)', reason: 'RESEND_API_KEY not set' },
      }),
    );
  });

  it('only warns quietly (no Sentry) outside production', () => {
    process.env.NODE_ENV = 'test';
    const logger = makeLogger();

    alertIfStubInProduction(logger as any, 'Web push', 'VAPID keys not set');

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('STUB mode'));
    expect(logger.error).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});
