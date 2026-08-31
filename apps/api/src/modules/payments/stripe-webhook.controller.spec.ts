import type { RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import Stripe from 'stripe';

import { StripeService } from '../../stripe/stripe.service';

import { StripeWebhookDeliveryService } from './stripe-webhook-delivery.service';
import { StripeWebhookController } from './stripe-webhook.controller';

function event(id = 'evt_duplicate', type = 'payment_intent.succeeded'): Stripe.Event {
  return {
    id,
    type,
    created: 1_700_000_000,
    data: { object: { id: 'pi_1' } },
  } as Stripe.Event;
}

function build() {
  const rows = new Map<string, any>();
  let sequence = 0;
  const prisma: any = {
    processedWebhookEvent: {
      create: jest.fn(async ({ data }: any) => {
        if (rows.has(data.stripeEventId)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint', {
            code: 'P2002',
            clientVersion: '5.22.0',
          });
        }
        const row = {
          id: `claim-${++sequence}`,
          claimedAt: new Date(),
          updatedAt: new Date(),
          enqueueAttempts: 0,
          ...data,
        };
        rows.set(data.stripeEventId, row);
        return { id: row.id };
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const row = [...rows.values()].find((candidate) => candidate.id === where.id);
        if (!row || !where.status.in.includes(row.status)) return { count: 0 };
        Object.assign(row, {
          ...data,
          enqueueAttempts: row.enqueueAttempts + (data.enqueueAttempts?.increment ?? 0),
          updatedAt: new Date(),
        });
        return { count: 1 };
      }),
      findUnique: jest.fn(async ({ where }: any) =>
        [...rows.values()].find((candidate) => candidate.id === where.id),
      ),
      update: jest.fn(async ({ where, data }: any) => {
        const row = [...rows.values()].find((candidate) => candidate.id === where.id);
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      }),
      findMany: jest.fn(async () =>
        [...rows.values()].filter(
          (row) =>
            (row.status === 'enqueue_failed' && row.nextAttemptAt <= new Date()) ||
            row.status === 'claimed' ||
            row.status === 'enqueueing',
        ),
      ),
    },
  };
  const queue = { add: jest.fn().mockResolvedValue({ id: 'job' }) };
  const delivery = new StripeWebhookDeliveryService(prisma, queue as any);
  const stripe = { constructEvent: jest.fn().mockReturnValue(event()) };
  const config = new ConfigService({ STRIPE_WEBHOOK_SECRET: 'whsec_test' });
  const controller = new StripeWebhookController(
    stripe as unknown as StripeService,
    prisma,
    config,
    delivery,
  );
  const request = { rawBody: Buffer.from('{}') } as RawBodyRequest<Request>;
  return { controller, stripe, prisma, queue, rows, request, delivery };
}

describe('StripeWebhookController claim-before-queue', () => {
  it.each([2, 5])(
    'accepts %i concurrent copies with one row and one queued job',
    async (copies) => {
      const { controller, queue, rows, request } = build();
      await Promise.all(
        Array.from({ length: copies }, () => controller.handle(request, 'valid-signature')),
      );
      expect(rows.size).toBe(1);
      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(queue.add).toHaveBeenCalledWith(
        'payment_intent.succeeded',
        expect.objectContaining({ id: 'evt_duplicate' }),
        expect.objectContaining({ jobId: 'evt_duplicate' }),
      );
    },
  );

  it('accepts sequential duplicates with one row and one queued job', async () => {
    const { controller, queue, rows, request } = build();
    await controller.handle(request, 'valid-signature');
    await controller.handle(request, 'valid-signature');
    expect(rows.size).toBe(1);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('records an unknown valid event without queueing it', async () => {
    const { controller, stripe, queue, rows, request } = build();
    stripe.constructEvent.mockReturnValue(
      event('evt_unknown', 'radar.early_fraud_warning.created'),
    );
    await controller.handle(request, 'valid-signature');
    expect(rows.get('evt_unknown')?.status).toBe('ignored');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('rejects an invalid signature without recording or queueing', async () => {
    const { controller, stripe, queue, rows, request } = build();
    stripe.constructEvent.mockImplementation(() => {
      throw new Error('bad signature');
    });
    await expect(controller.handle(request, 'bad-signature')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_SIGNATURE' }),
    });
    expect(rows.size).toBe(0);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('leaves a failed queue handoff recoverable and later queues it once', async () => {
    const { controller, queue, rows, request, delivery } = build();
    queue.add.mockRejectedValueOnce(new Error('redis unavailable'));
    await expect(controller.handle(request, 'valid-signature')).rejects.toThrow(
      'redis unavailable',
    );
    const row = rows.get('evt_duplicate');
    expect(row.status).toBe('enqueue_failed');
    row.nextAttemptAt = new Date(0);
    await delivery.recover();
    expect(row.status).toBe('queued');
    expect(queue.add).toHaveBeenCalledTimes(2);
  });
});

describe('signed Stripe test event', () => {
  it('is accepted with the non-production signing secret', () => {
    const secret = 'whsec_test_local';
    const payload = JSON.stringify(event('evt_signed_test'));
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    const service = new StripeService(new Stripe('sk_test_local'));
    expect(service.constructEvent(Buffer.from(payload), signature, secret).id).toBe(
      'evt_signed_test',
    );
  });
});
