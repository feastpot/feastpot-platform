import type { ConfigService } from '@nestjs/config';

import type { PrismaService } from '../../prisma/prisma.service';
import type { SupabaseService } from '../../supabase/supabase.service';
import type { LoyaltyService } from '../loyalty/loyalty.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { EmailProvider } from '../notifications/providers/email.provider';

import { AdminUsersService } from './admin-users.service';

/**
 * Bulk order status override is an emergency-repair tool: it must write the
 * status directly and audit each change, but MUST NOT fire customer
 * notifications - an admin bulk-repairing 100 orders would otherwise text
 * 100 customers. This spec pins that contract.
 */
describe('AdminUsersService.bulkOverrideOrderStatus', () => {
  function makeService() {
    const prisma = {
      order: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const notifications = { enqueue: jest.fn() };
    const email = { send: jest.fn() };
    const service = new AdminUsersService(
      prisma as unknown as PrismaService,
      {} as unknown as SupabaseService,
      {} as unknown as LoyaltyService,
      notifications as unknown as NotificationsService,
      { get: jest.fn() } as unknown as ConfigService,
      email as unknown as EmailProvider,
    );
    return { service, prisma, notifications, email };
  }

  it('updates each order with an audit row and never enqueues notifications', async () => {
    const { service, prisma, notifications, email } = makeService();
    prisma.order.findUnique
      .mockResolvedValueOnce({ id: 'o-1', status: 'preparing' })
      .mockResolvedValueOnce({ id: 'o-2', status: 'preparing' });
    prisma.order.update.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ id: where.id, status: 'delivered' }),
    );

    const res = await service.bulkOverrideOrderStatus(
      ['o-1', 'o-2'],
      'delivered' as never,
      'vendor confirmed by phone',
      'admin-1',
    );

    expect(res.updated).toBe(2);
    expect(res.failed).toBe(0);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(2);
    // The whole point: no customer-facing side effects.
    expect(notifications.enqueue).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('reports partial success without aborting the batch or notifying', async () => {
    const { service, prisma, notifications } = makeService();
    prisma.order.findUnique
      .mockResolvedValueOnce(null) // o-missing → NotFoundException
      .mockResolvedValueOnce({ id: 'o-2', status: 'preparing' });
    prisma.order.update.mockResolvedValue({ id: 'o-2', status: 'delivered' });

    const res = await service.bulkOverrideOrderStatus(
      ['o-missing', 'o-2'],
      'delivered' as never,
      'repair',
      'admin-1',
    );

    expect(res.updated).toBe(1);
    expect(res.failed).toBe(1);
    expect(res.results[0]).toMatchObject({ orderId: 'o-missing', ok: false });
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });
});
