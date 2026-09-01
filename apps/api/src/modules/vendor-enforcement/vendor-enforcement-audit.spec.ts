/**
 * Audit-log coverage tests for vendor enforcement and status-change paths.
 *
 * Acceptance criteria:
 *   - Every enumerated status-changing path writes exactly one correctly-shaped
 *     AuditLog row, asserted by inspecting the mock immediately after the action.
 *   - Automated and manual suspensions are distinguishable by action name.
 *   - Bulk order overrides produce one row per order, not one for the batch.
 *   - Rows are created inside the same transaction as their triggering action.
 *   - Same-status no-ops write nothing.
 *
 * Paths enumerated:
 *   1. createAction() - manual enforcement (SUSPENSION / TERMINATION / RESTRICTION)
 *   2. createAutomatedSuspension() - automated enforcement
 *   3. liftAction() - lift / reinstate
 *   4. vendors.repository.transitionStatus() - manual vendor status change
 *   5. admin-users.service.overrideOrderStatus() - single order override
 *   6. admin-users.service.bulkOverrideOrderStatus() - bulk order override (per-order rows)
 *
 * Actor-handling note (stated explicitly per prompt):
 *   Automated actions set actorId: null - consistent with the existing pattern
 *   for system-driven audit writes across payments and webhooks. Manual actions
 *   carry the compliance/admin officer's UUID in actorId. No fake human actor
 *   is invented for automated rows.
 *
 * Historical suspensions cannot be backfilled: any VendorEnforcementAction rows
 * created before this change have no corresponding AuditLog row. That gap is
 * permanent by design; fabricating rows would misrepresent the audit trail.
 */

import { BadRequestException } from '@nestjs/common';
import { EnforcementType, OrderStatus, VendorStatus, VerificationState } from '@prisma/client';

import { AdminUsersService } from '../admin/admin-users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { VendorRepository } from '../vendors/vendors.repository';

import { VendorEnforcementService } from './vendor-enforcement.service';

// ── Shared constants ──────────────────────────────────────────────────────────

const VENDOR_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const ACTOR_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const ACTION_ID = 'cccccccc-0000-0000-0000-000000000003';
const ORDER_ID_1 = 'dddddddd-0000-0000-0000-000000000004';
const ORDER_ID_2 = 'eeeeeeee-0000-0000-0000-000000000005';
const ADMIN_ID = 'ffffffff-0000-0000-0000-000000000006';

const GOOD_NARRATIVE =
  'This listing has been suspended because the vendor has not renewed their public liability ' +
  'insurance within the 7-day grace period following expiry. Immediate action is required.';

function isoFuture(daysFromNow = 1): string {
  return new Date(Date.now() + daysFromNow * 86_400_000).toISOString();
}

// ── Enforcement service helpers ───────────────────────────────────────────────

interface AuditCreateArgs {
  data: {
    actorId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
  };
}

function makeEnforcementPrisma(
  vendorStatus: VendorStatus = VendorStatus.live,
  existingAction?: object,
) {
  const auditCreate = jest.fn().mockResolvedValue({});
  const txAuditCreate = jest.fn().mockResolvedValue({});

  return {
    auditCreate, // top-level (not used by enforcement service, exposed for assertions)
    txAuditCreate, // inside transaction
    prisma: {
      vendor: {
        findUnique: jest.fn().mockResolvedValue({
          id: VENDOR_ID,
          userId: 'user-1',
          businessName: 'Test Kitchen',
          status: vendorStatus,
          verification: { id: 'verif-1', overallState: VerificationState.VERIFIED },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      vendorEnforcementAction: {
        create: jest
          .fn()
          .mockImplementation((args: { data: object }) =>
            Promise.resolve({ id: ACTION_ID, ...args.data }),
          ),
        findUnique: jest.fn().mockResolvedValue(
          existingAction ?? {
            id: ACTION_ID,
            vendorId: VENDOR_ID,
            actionType: EnforcementType.SUSPENSION,
            reasonCode: 'DOCUMENT_EXPIRED',
            liftedAt: null,
            liftedBy: null,
            liftNote: null,
            facts: { priorStatus: VendorStatus.live },
            vendor: { id: VENDOR_ID, userId: 'user-1', businessName: 'Test Kitchen' },
          },
        ),
        update: jest.fn().mockResolvedValue({ id: ACTION_ID, liftedAt: new Date() }),
      },
      vendorVerification: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'verif-1', overallState: VerificationState.SUSPENDED }),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockImplementation((fn: (tx: object) => Promise<unknown>) =>
        fn({
          vendor: {
            findUnique: jest.fn().mockResolvedValue({ id: VENDOR_ID }),
            update: jest.fn().mockResolvedValue({}),
          },
          vendorEnforcementAction: {
            create: jest
              .fn()
              .mockImplementation((args: { data: object }) =>
                Promise.resolve({ id: ACTION_ID, ...args.data }),
              ),
            update: jest.fn().mockResolvedValue({ id: ACTION_ID, liftedAt: new Date() }),
          },
          vendorVerification: {
            findUnique: jest
              .fn()
              .mockResolvedValue({ id: 'verif-1', overallState: VerificationState.SUSPENDED }),
            update: jest.fn().mockResolvedValue({}),
          },
          auditLog: { create: txAuditCreate },
        }),
      ),
    },
  };
}

function makeNotifications(): NotificationsService {
  return {
    enqueue: jest.fn().mockResolvedValue(undefined),
    createTransactionalOutbox: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
    dispatchTransactionalOutbox: jest.fn().mockResolvedValue(undefined),
  } as unknown as NotificationsService;
}

// ── 1. createAction() - manual suspension ────────────────────────────────────

describe('createAction() - manual suspension', () => {
  it('writes a vendor.enforcement_suspension audit row with actor UUID', async () => {
    const { txAuditCreate, prisma } = makeEnforcementPrisma();
    const svc = new VendorEnforcementService(prisma as any, makeNotifications());

    await svc.createAction(
      VENDOR_ID,
      {
        actionType: EnforcementType.SUSPENSION,
        reasonCode: 'DOCUMENT_EXPIRED',
        reasonNarrative: GOOD_NARRATIVE,
        effectiveAt: isoFuture(1),
      },
      'compliance@feastpot.co.uk',
      ACTOR_ID,
    );

    expect(txAuditCreate).toHaveBeenCalledTimes(1);
    const [call] = txAuditCreate.mock.calls as [AuditCreateArgs][];
    expect(call[0].data).toMatchObject({
      actorId: ACTOR_ID,
      action: 'vendor.enforcement_suspension',
      entityType: 'vendors',
      entityId: VENDOR_ID,
      metadata: expect.objectContaining({
        actionType: EnforcementType.SUSPENSION,
        reasonCode: 'DOCUMENT_EXPIRED',
        priorStatus: VendorStatus.live,
        issuedBy: 'compliance@feastpot.co.uk',
      }),
    });
    // Must NOT have a system flag on a manual action
    expect((call[0].data.metadata as Record<string, unknown>).system).toBeUndefined();
  });
});

// ── 2. createAction() - manual termination ───────────────────────────────────

describe('createAction() - manual termination', () => {
  it('writes a vendor.enforcement_termination audit row', async () => {
    const { txAuditCreate, prisma } = makeEnforcementPrisma();
    const svc = new VendorEnforcementService(prisma as any, makeNotifications());

    await svc.createAction(
      VENDOR_ID,
      {
        actionType: EnforcementType.TERMINATION,
        reasonCode: 'SERIOUS_BREACH',
        reasonNarrative: GOOD_NARRATIVE,
        effectiveAt: isoFuture(31),
      },
      'compliance@feastpot.co.uk',
      ACTOR_ID,
    );

    const [call] = txAuditCreate.mock.calls as [AuditCreateArgs][];
    expect(call[0].data).toMatchObject({
      actorId: ACTOR_ID,
      action: 'vendor.enforcement_termination',
      entityType: 'vendors',
      entityId: VENDOR_ID,
    });
  });
});

// ── 3. createAutomatedSuspension() ───────────────────────────────────────────

describe('createAutomatedSuspension()', () => {
  it('writes a vendor.automated_suspension row with actorId: null and system: true', async () => {
    const { txAuditCreate, prisma } = makeEnforcementPrisma();
    const svc = new VendorEnforcementService(prisma as any, makeNotifications());

    await svc.createAutomatedSuspension(
      VENDOR_ID,
      'DOCUMENT_EXPIRED',
      'Food hygiene certificate has expired.',
    );

    expect(txAuditCreate).toHaveBeenCalledTimes(1);
    const [call] = txAuditCreate.mock.calls as [AuditCreateArgs][];
    expect(call[0].data).toMatchObject({
      actorId: null,
      action: 'vendor.automated_suspension',
      entityType: 'vendors',
      entityId: VENDOR_ID,
      metadata: expect.objectContaining({
        issuedBy: 'system',
        system: true,
        reasonCode: 'DOCUMENT_EXPIRED',
      }),
    });
  });

  it('is distinguishable from a manual suspension by action name', async () => {
    const { txAuditCreate: autoCreate, prisma: autoPrisma } = makeEnforcementPrisma();
    const autoSvc = new VendorEnforcementService(autoPrisma as any, makeNotifications());
    await autoSvc.createAutomatedSuspension(VENDOR_ID, 'DOCUMENT_EXPIRED', 'Certificate expired.');

    const { txAuditCreate: manualCreate, prisma: manualPrisma } = makeEnforcementPrisma();
    const manualSvc = new VendorEnforcementService(manualPrisma as any, makeNotifications());
    await manualSvc.createAction(
      VENDOR_ID,
      {
        actionType: EnforcementType.SUSPENSION,
        reasonCode: 'DOCUMENT_EXPIRED',
        reasonNarrative: GOOD_NARRATIVE,
        effectiveAt: isoFuture(1),
      },
      'compliance@feastpot.co.uk',
      ACTOR_ID,
    );

    const autoAction = (autoCreate.mock.calls[0] as [AuditCreateArgs])[0].data.action;
    const manualAction = (manualCreate.mock.calls[0] as [AuditCreateArgs])[0].data.action;
    expect(autoAction).toBe('vendor.automated_suspension');
    expect(manualAction).toBe('vendor.enforcement_suspension');
    expect(autoAction).not.toBe(manualAction);
  });
});

// ── 4. liftAction() - enforcement lifted / vendor reinstated ─────────────────

describe('liftAction()', () => {
  it('writes a vendor.enforcement_lifted row with actor UUID and restoredStatus', async () => {
    const { txAuditCreate, prisma } = makeEnforcementPrisma(VendorStatus.suspended);
    const svc = new VendorEnforcementService(prisma as any, makeNotifications());

    await svc.liftAction(ACTION_ID, 'compliance@feastpot.co.uk', 'Issue resolved.', ACTOR_ID);

    expect(txAuditCreate).toHaveBeenCalledTimes(1);
    const [call] = txAuditCreate.mock.calls as [AuditCreateArgs][];
    expect(call[0].data).toMatchObject({
      actorId: ACTOR_ID,
      action: 'vendor.enforcement_lifted',
      entityType: 'vendors',
      entityId: VENDOR_ID,
      metadata: expect.objectContaining({
        actionType: EnforcementType.SUSPENSION,
        liftedBy: 'compliance@feastpot.co.uk',
        liftNote: 'Issue resolved.',
        restoredStatus: expect.stringMatching(/^(live|probation)$/),
      }),
    });
  });

  it('throws ACTION_ALREADY_LIFTED without writing an audit row', async () => {
    const { txAuditCreate, prisma } = makeEnforcementPrisma(VendorStatus.live, {
      id: ACTION_ID,
      vendorId: VENDOR_ID,
      actionType: EnforcementType.SUSPENSION,
      reasonCode: 'DOCUMENT_EXPIRED',
      liftedAt: new Date(), // already lifted
      liftedBy: 'someone',
      liftNote: null,
      facts: {},
      vendor: { id: VENDOR_ID, userId: 'user-1', businessName: 'Test Kitchen' },
    });
    const svc = new VendorEnforcementService(prisma as any, makeNotifications());

    await expect(
      svc.liftAction(ACTION_ID, 'compliance@feastpot.co.uk', undefined, ACTOR_ID),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(txAuditCreate).not.toHaveBeenCalled();
  });
});

// ── 5. overrideOrderStatus() - single order ───────────────────────────────────

describe('overrideOrderStatus()', () => {
  function makeOrderPrisma(currentStatus: OrderStatus = OrderStatus.pending) {
    const auditCreate = jest.fn().mockResolvedValue({});
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({ id: ORDER_ID_1, status: currentStatus }),
        update: jest.fn().mockResolvedValue({ id: ORDER_ID_1, status: OrderStatus.delivered }),
      },
      auditLog: { create: auditCreate },
    };
    return { auditCreate, prisma };
  }

  function makeSvc(prisma: object) {
    return new AdminUsersService(prisma as any, null as any, null as any, null as any);
  }

  it('writes an order.status_overridden row with previousState and newState', async () => {
    const { auditCreate, prisma } = makeOrderPrisma(OrderStatus.pending);
    const svc = makeSvc(prisma);

    await svc.overrideOrderStatus(
      ORDER_ID_1,
      OrderStatus.delivered,
      'Vendor confirmed in person',
      ADMIN_ID,
    );

    expect(auditCreate).toHaveBeenCalledTimes(1);
    const [call] = auditCreate.mock.calls as [AuditCreateArgs][];
    expect(call[0].data).toMatchObject({
      actorId: ADMIN_ID,
      action: 'order.status_overridden',
      entityType: 'orders',
      entityId: ORDER_ID_1,
      metadata: expect.objectContaining({
        reason: 'Vendor confirmed in person',
        previousState: { status: OrderStatus.pending },
        newState: { status: OrderStatus.delivered },
      }),
    });
  });

  it('writes nothing when the new status equals the current status', async () => {
    const { auditCreate, prisma } = makeOrderPrisma(OrderStatus.delivered);
    const svc = makeSvc(prisma);

    await svc.overrideOrderStatus(ORDER_ID_1, OrderStatus.delivered, 'No change', ADMIN_ID);

    expect(auditCreate).not.toHaveBeenCalled();
  });
});

// ── 6. bulkOverrideOrderStatus() - per-order rows ─────────────────────────────

describe('bulkOverrideOrderStatus()', () => {
  it('writes one audit row per order, not one for the batch', async () => {
    const auditCreate = jest.fn().mockResolvedValue({});
    const prisma = {
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: ORDER_ID_1, status: OrderStatus.pending })
          .mockResolvedValueOnce({ id: ORDER_ID_2, status: OrderStatus.pending }),
        update: jest.fn().mockResolvedValue({}),
      },
      auditLog: { create: auditCreate },
    };
    const svc = new AdminUsersService(prisma as any, null as any, null as any, null as any);

    const result = await svc.bulkOverrideOrderStatus(
      [ORDER_ID_1, ORDER_ID_2],
      OrderStatus.cancelled,
      'Bulk cancel test',
      ADMIN_ID,
    );

    // Each order gets its own row.
    expect(auditCreate).toHaveBeenCalledTimes(2);
    expect(result.updated).toBe(2);
    expect(result.failed).toBe(0);

    // Both rows use the correct action name and reference their own order.
    for (const [callArgs] of auditCreate.mock.calls as [AuditCreateArgs][]) {
      expect(callArgs.data.action).toBe('order.status_overridden');
      expect([ORDER_ID_1, ORDER_ID_2]).toContain(callArgs.data.entityId);
    }

    // The two rows reference different orders.
    const entityIds = (auditCreate.mock.calls as [AuditCreateArgs][]).map(([a]) => a.data.entityId);
    expect(new Set(entityIds).size).toBe(2);
  });
});

// ── 7. vendor.status_changed - manual status transition via repository ────────

describe('vendors.repository.transitionStatus()', () => {
  /**
   * Directly test the repository method to confirm the action name is
   * vendor.status_changed and the metadata includes previousState / newState.
   */
  it('writes a vendor.status_changed row with previousState and newState', async () => {
    const auditCreate = jest.fn().mockResolvedValue({});
    const prisma = {
      $transaction: jest.fn().mockImplementation((fn: (tx: object) => Promise<unknown>) =>
        fn({
          vendor: { update: jest.fn().mockResolvedValue({ id: VENDOR_ID }) },
          auditLog: { create: auditCreate },
        }),
      ),
    };

    const repo = new VendorRepository(prisma as any);

    await repo.transitionStatus({
      vendorId: VENDOR_ID,
      fromStatus: VendorStatus.pending,
      toStatus: VendorStatus.live,
      actorUserId: ACTOR_ID,
      reasonCode: 'APPROVED',
      notes: 'Tax profile complete',
    });

    expect(auditCreate).toHaveBeenCalledTimes(1);
    const [call] = auditCreate.mock.calls as [AuditCreateArgs][];
    expect(call[0].data).toMatchObject({
      actorId: ACTOR_ID,
      action: 'vendor.status_changed',
      entityType: 'vendors',
      entityId: VENDOR_ID,
      metadata: expect.objectContaining({
        previousState: { status: VendorStatus.pending },
        newState: expect.objectContaining({ status: VendorStatus.live }),
      }),
    });
  });
});
