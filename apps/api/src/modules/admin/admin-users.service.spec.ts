import type { ConfigService } from '@nestjs/config';

import type { PrismaService } from '../../prisma/prisma.service';
import type { SupabaseService } from '../../supabase/supabase.service';
import type { LoyaltyService } from '../loyalty/loyalty.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { EmailProvider } from '../notifications/providers/email.provider';

import { AdminUsersService } from './admin-users.service';
import { ASSIGNABLE_USER_ROLES } from './dto/admin-user-actions.dto';

describe('role assignment DTO values', () => {
  it('allows returning an existing staff account to the customer role', () => {
    expect(ASSIGNABLE_USER_ROLES).toContain('customer');
    expect(ASSIGNABLE_USER_ROLES).not.toContain('vendor');
  });
});

describe('AdminUsersService.updateUserRole', () => {
  it('keeps the self-demotion safeguard when customer is assignable', async () => {
    const service = new AdminUsersService(
      {} as PrismaService,
      {} as SupabaseService,
      {} as LoyaltyService,
      {} as NotificationsService,
      {} as ConfigService,
      {} as EmailProvider,
    );

    await expect(
      service.updateUserRole(
        'admin-user',
        'customer',
        'Attempted self-demotion to customer role',
        'admin-user',
      ),
    ).rejects.toMatchObject({ response: { code: 'CANNOT_CHANGE_OWN_ROLE' } });
  });

  it('returns an existing staff account to customer and writes the audited transition', async () => {
    const tx = {
      user: { update: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'target-user',
          role: 'support',
          status: 'active',
          email: 'staff@example.test',
          vendor: null,
        }),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const updateUserById = jest.fn().mockResolvedValue({});
    const signOut = jest.fn().mockResolvedValue({});
    const supabase = {
      getClient: jest.fn().mockReturnValue({
        auth: { admin: { updateUserById, signOut } },
      }),
    };
    const service = new AdminUsersService(
      prisma as unknown as PrismaService,
      supabase as unknown as SupabaseService,
      {} as LoyaltyService,
      {} as NotificationsService,
      {} as ConfigService,
      {} as EmailProvider,
    );

    await service.updateUserRole(
      'target-user',
      'customer',
      'Role no longer requires staff-console access',
      'admin-user',
    );

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'target-user' },
      data: { role: 'customer' },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'admin-user',
          entityId: 'target-user',
          action: 'admin.user_role_changed',
          metadata: expect.objectContaining({
            previousState: { role: 'support' },
            newState: { role: 'customer' },
          }),
        }),
      }),
    );
    expect(updateUserById).toHaveBeenCalledWith('target-user', {
      app_metadata: { role: 'customer' },
    });
  });

  it('rejects a last active admin demotion inside the serializable transaction', async () => {
    const tx = {
      user: {
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'target-admin',
          role: 'admin',
          status: 'active',
          email: 'admin@example.test',
          vendor: null,
        }),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = new AdminUsersService(
      prisma as unknown as PrismaService,
      {} as SupabaseService,
      {} as LoyaltyService,
      {} as NotificationsService,
      {} as ConfigService,
      {} as EmailProvider,
    );

    await expect(
      service.updateUserRole(
        'target-admin',
        'support',
        'Coverage handover; a second admin has not yet been promoted.',
        'different-admin',
      ),
    ).rejects.toMatchObject({ response: { code: 'LAST_ADMIN' } });
    expect(tx.user.count).toHaveBeenCalledWith({ where: { role: 'admin', status: 'active' } });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});

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

describe('AdminUsersService.exportUsersCsv', () => {
  it('labels explicit test-data provenance in the header and exported rows', async () => {
    const prisma = {
      user: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: 'user-1',
              email: 'fixture@example.test',
              firstName: 'Fixture',
              lastName: 'User',
              role: 'customer',
              status: 'active',
              isTestData: true,
              provenance: 'test-factory',
              createdAt: new Date('2030-01-02T03:04:05.000Z'),
              _count: { orders: 2 },
            },
          ])
          .mockResolvedValueOnce([]),
      },
    };
    const service = new AdminUsersService(
      prisma as unknown as PrismaService,
      {} as SupabaseService,
      {} as LoyaltyService,
      {} as NotificationsService,
      {} as ConfigService,
      {} as EmailProvider,
    );
    const chunks: string[] = [];

    await service.exportUsersCsv({ includeTestData: true }, (chunk) => chunks.push(chunk));

    expect(chunks[0]).toBe(
      'created_at,email,first_name,last_name,role,status,orders,is_test_data,provenance\n',
    );
    expect(chunks[1]).toBe(
      '2030-01-02T03:04:05.000Z,fixture@example.test,Fixture,User,customer,active,2,true,test-factory\n',
    );
  });
});
