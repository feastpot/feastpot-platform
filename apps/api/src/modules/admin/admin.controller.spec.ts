import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';

import { AdminController } from './admin.controller';
import { PayoutsController } from '../payouts/payouts.controller';
import { ComplianceController } from '../compliance/compliance.controller';
import { DisputesController } from '../disputes/disputes.controller';

/**
 * Per-route role enforcement tests (Step 6 of the security audit).
 *
 * These tests assert the decorator metadata declared on each controller
 * method - i.e. the contract the global RolesGuard enforces at runtime -
 * rather than spinning up the full Nest app. That keeps the tests:
 *   - fast (no DI container, no Prisma, no Stripe);
 *   - deterministic (no role can sneak through via mocked guards);
 *   - and a true source-of-truth check on the decorators themselves so
 *     accidentally widening @Roles in a future PR is caught.
 *
 * For each spec we then run the actual RolesGuard against synthesised
 * execution contexts to prove the (allowed, denied) behaviour the spec
 * file calls out.
 */

const reflector = new Reflector();
const guard = new RolesGuard(reflector);

function rolesOn(controller: new (...args: never[]) => unknown, method: string): UserRole[] {
  const proto = controller.prototype as Record<string, (...args: never[]) => unknown>;
  const handler = proto[method];
  if (!handler) throw new Error(`No method ${method} on ${controller.name}`);
  return Reflect.getMetadata(ROLES_KEY, handler) as UserRole[];
}

function ctxFor(controller: new (...args: never[]) => unknown, method: string, role: UserRole | null): ExecutionContext {
  const proto = controller.prototype as Record<string, (...args: never[]) => unknown>;
  const handler = proto[method];
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { id: 'u', email: 'u@e', role } : null }) }),
    getHandler: () => handler,
    getClass: () => controller,
  } as unknown as ExecutionContext;
}

function expectAllowed(controller: new (...args: never[]) => unknown, method: string, role: UserRole) {
  expect(guard.canActivate(ctxFor(controller, method, role))).toBe(true);
}
function expectDenied(controller: new (...args: never[]) => unknown, method: string, role: UserRole) {
  expect(() => guard.canActivate(ctxFor(controller, method, role))).toThrow(ForbiddenException);
}

describe('Admin role enforcement', () => {
  // ---------------------- AdminController ----------------------

  it('declares the spec-mandated roles on every admin route', () => {
    expect(new Set(rolesOn(AdminController, 'dashboard'))).toEqual(
      new Set([UserRole.admin, UserRole.finance, UserRole.support, UserRole.compliance]),
    );
    expect(new Set(rolesOn(AdminController, 'listVendors'))).toEqual(
      new Set([UserRole.admin, UserRole.compliance, UserRole.support]),
    );
    expect(new Set(rolesOn(AdminController, 'listAuditLog'))).toEqual(
      new Set([UserRole.admin, UserRole.compliance]),
    );
    expect(new Set(rolesOn(AdminController, 'exportAuditLogCsv'))).toEqual(
      new Set([UserRole.admin, UserRole.compliance]),
    );
    expect(new Set(rolesOn(AdminController, 'listExpiring'))).toEqual(
      new Set([UserRole.admin, UserRole.compliance]),
    );
    expect(new Set(rolesOn(AdminController, 'reconcilePayout'))).toEqual(
      new Set([UserRole.admin, UserRole.finance]),
    );
  });

  it('should allow finance admin to POST reconcile-stripe', () => {
    expectAllowed(AdminController, 'reconcilePayout', UserRole.finance);
  });
  it('should reject support agent from POST reconcile-stripe with 403', () => {
    expectDenied(AdminController, 'reconcilePayout', UserRole.support);
  });
  it('should reject compliance admin from POST reconcile-stripe with 403', () => {
    expectDenied(AdminController, 'reconcilePayout', UserRole.compliance);
  });

  it('should allow compliance admin to GET compliance/expiring', () => {
    expectAllowed(AdminController, 'listExpiring', UserRole.compliance);
  });
  it('should reject finance admin from GET compliance/expiring with 403', () => {
    expectDenied(AdminController, 'listExpiring', UserRole.finance);
  });
  it('should reject support agent from GET compliance/expiring with 403', () => {
    expectDenied(AdminController, 'listExpiring', UserRole.support);
  });

  it('should reject support agent from GET audit-log with 403', () => {
    expectDenied(AdminController, 'listAuditLog', UserRole.support);
    expectDenied(AdminController, 'exportAuditLogCsv', UserRole.support);
  });
  it('should reject finance admin from GET audit-log with 403', () => {
    expectDenied(AdminController, 'listAuditLog', UserRole.finance);
    expectDenied(AdminController, 'exportAuditLogCsv', UserRole.finance);
  });

  // ---------------------- PayoutsController ----------------------

  it('should allow finance admin to POST payouts/:id/approve', () => {
    expectAllowed(PayoutsController, 'approve', UserRole.finance);
  });
  it('should allow admin to POST payouts/:id/approve', () => {
    expectAllowed(PayoutsController, 'approve', UserRole.admin);
  });
  it('should reject support agent from POST payouts/:id/approve with 403', () => {
    expectDenied(PayoutsController, 'approve', UserRole.support);
  });
  it('should reject compliance admin from POST payouts/:id/approve with 403', () => {
    expectDenied(PayoutsController, 'approve', UserRole.compliance);
  });
  it('should reject vendor from POST payouts/:id/approve with 403', () => {
    expectDenied(PayoutsController, 'approve', UserRole.vendor);
  });

  it('should reject support agent from PATCH payouts/:id/hold with 403', () => {
    expectDenied(PayoutsController, 'hold', UserRole.support);
  });
  it('should reject compliance admin from PATCH payouts/:id/hold with 403', () => {
    expectDenied(PayoutsController, 'hold', UserRole.compliance);
  });

  // ---------------------- ComplianceController ----------------------

  it('should reject support agent from PATCH /vendors/:id/documents/:id/verify with 403', () => {
    expectDenied(ComplianceController, 'verify', UserRole.support);
  });
  it('should reject finance admin from PATCH /vendors/:id/documents/:id/verify with 403', () => {
    expectDenied(ComplianceController, 'verify', UserRole.finance);
  });
  it('should allow compliance admin to PATCH /vendors/:id/documents/:id/verify', () => {
    expectAllowed(ComplianceController, 'verify', UserRole.compliance);
  });
  it('should reject customer from GET /vendors/:id/documents with 403', () => {
    expectDenied(ComplianceController, 'list', UserRole.customer);
  });

  // ---------------------- DisputesController ----------------------

  it('should reject finance admin from GET /disputes with 403', () => {
    expectDenied(DisputesController, 'list', UserRole.finance);
  });
  it('should reject compliance admin from GET /disputes with 403', () => {
    expectDenied(DisputesController, 'list', UserRole.compliance);
  });
  it('should allow customer/vendor/support/admin to GET /disputes', () => {
    expectAllowed(DisputesController, 'list', UserRole.customer);
    expectAllowed(DisputesController, 'list', UserRole.vendor);
    expectAllowed(DisputesController, 'list', UserRole.support);
    expectAllowed(DisputesController, 'list', UserRole.admin);
  });
  it('should allow admin to POST /disputes/:id/escalate', () => {
    expectAllowed(DisputesController, 'escalate', UserRole.admin);
  });
  it('should reject vendor from POST /disputes/:id/escalate with 403', () => {
    expectDenied(DisputesController, 'escalate', UserRole.vendor);
  });
  it('should reject customer from PATCH /disputes/:id with 403', () => {
    expectDenied(DisputesController, 'update', UserRole.customer);
  });
});
