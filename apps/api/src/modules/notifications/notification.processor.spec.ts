import * as Sentry from '@sentry/nestjs';

import { NotificationProcessor } from './notification.processor';
import { alertIfStubInProduction } from './providers/stub-alert';

jest.mock('@sentry/nestjs', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

type Mock = jest.Mock;

function makePrisma(user: Record<string, unknown> | null) {
  return {
    user: { findUnique: jest.fn().mockResolvedValue(user) as Mock },
    notificationPreference: { findMany: jest.fn().mockResolvedValue([]) as Mock },
    notification: { create: jest.fn().mockResolvedValue({ id: 'n-1' }) as Mock },
    // Suppression check: default to not suppressed.
    emailEvent: { findFirst: jest.fn().mockResolvedValue(null) as Mock },
  };
}

function makeProviders() {
  return {
    email: { send: jest.fn().mockResolvedValue({ id: 'e-1', delivered: true }) as Mock },
    whatsapp: { send: jest.fn().mockResolvedValue({ id: 'w-1', delivered: true }) as Mock },
    push: { send: jest.fn().mockResolvedValue({ delivered: 1, failed: 0 }) as Mock },
    sms: { send: jest.fn().mockResolvedValue({ id: 's-1', delivered: true }) as Mock },
  };
}

function makeProcessor(prisma: ReturnType<typeof makePrisma>, providers = makeProviders()) {
  const queue = { add: jest.fn() };
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
  firstName: 'Priya',
};

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
