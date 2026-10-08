import { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { UserRole, VendorApplicationStatus } from '@prisma/client';

import { RolesGuard } from '../../auth/guards/roles.guard';
import type { SupabaseService } from '../../auth/supabase.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { StripeService } from '../../stripe/stripe.service';
import type { AnalyticsService } from '../analytics/analytics.service';
import type { EmailProvider } from '../notifications/providers/email.provider';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

describe('Vendor invitation resends', () => {
  const application = {
    id: 'application-id',
    status: VendorApplicationStatus.approved,
    email: ' Vendor@Example.test ',
    fullName: 'Test Vendor',
    kitchenName: 'Test Kitchen',
    vendor: { id: 'vendor-id', userId: 'user-id', businessName: 'Test Kitchen' },
  };
  let service: AdminService;
  let findUnique: jest.Mock;
  let audit: jest.Mock;
  let generateLink: jest.Mock;
  let send: jest.Mock;

  beforeEach(() => {
    findUnique = jest.fn().mockResolvedValue(application);
    audit = jest.fn().mockResolvedValue({});
    generateLink = jest.fn().mockResolvedValue({
      data: { properties: { hashed_token: 'fresh-token' } },
      error: null,
    });
    send = jest.fn().mockResolvedValue({ id: 'provider-id', delivered: true });
    service = new AdminService(
      {
        vendorApplication: { findUnique },
        auditLog: { create: audit },
      } as unknown as PrismaService,
      {} as StripeService,
      { getClient: () => ({ auth: { admin: { generateLink } } }) } as unknown as SupabaseService,
      { send } as unknown as EmailProvider,
      { get: () => 'https://vendor.example.test' } as unknown as ConfigService,
      {} as AnalyticsService,
    );
  });

  afterEach(() => jest.useRealTimers());

  it('generates a fresh recovery link, preserves onboarding, and records provider acceptance', async () => {
    await expect(
      service.resendVendorApplicationInvite(application.id, 'admin-id'),
    ).resolves.toEqual({
      ok: true,
      applicationId: application.id,
      email: 'vendor@example.test',
      providerMessageId: 'provider-id',
    });
    expect(generateLink).toHaveBeenCalledWith({
      type: 'recovery',
      email: 'vendor@example.test',
      options: { redirectTo: 'https://vendor.example.test/auth/reset/update?next=/onboarding' },
    });
    const html = send.mock.calls[0][0].html as string;
    expect(html).toContain('/auth/confirm?next=%2Fonboarding#token_hash=fresh-token');
    expect(html).toContain('type=recovery');
    expect(html).not.toContain('expires in 7 days');
    expect(audit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'admin-id',
        action: 'vendor_application.invite_resent',
        metadata: {
          vendorId: 'vendor-id',
          email: 'vendor@example.test',
          providerMessageId: 'provider-id',
        },
      }),
    });
  });

  it('regenerates the credential on every resend rather than reusing the old link', async () => {
    await service.resendVendorApplicationInvite(application.id, 'admin-id');
    generateLink.mockResolvedValue({
      data: { properties: { hashed_token: 'replacement-token' } },
      error: null,
    });
    await service.resendVendorApplicationInvite(application.id, 'admin-id');
    expect(generateLink).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].html).toContain('token_hash=replacement-token');
    expect(send.mock.calls[1][0].html).not.toContain('token_hash=fresh-token');
  });

  it.each([
    VendorApplicationStatus.pending,
    VendorApplicationStatus.under_review,
    VendorApplicationStatus.information_requested,
    VendorApplicationStatus.rejected,
  ])('rejects an application in state %s without sending anything', async (status) => {
    findUnique.mockResolvedValue({ ...application, status });
    await expect(
      service.resendVendorApplicationInvite(application.id, 'admin-id'),
    ).rejects.toMatchObject({
      response: { code: 'VENDOR_APPLICATION_NOT_PROVISIONED' },
    });
    expect(generateLink).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('rejects missing applications', async () => {
    findUnique.mockResolvedValue(null);
    await expect(
      service.resendVendorApplicationInvite(application.id, 'admin-id'),
    ).rejects.toMatchObject({
      response: { code: 'VENDOR_APPLICATION_NOT_FOUND' },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects approved applications without a provisioned vendor', async () => {
    findUnique.mockResolvedValue({ ...application, vendor: null });
    await expect(
      service.resendVendorApplicationInvite(application.id, 'admin-id'),
    ).rejects.toMatchObject({
      response: { code: 'VENDOR_APPLICATION_NOT_PROVISIONED' },
    });
    expect(generateLink).not.toHaveBeenCalled();
  });

  it.each([
    { data: null, error: { message: 'private provider diagnostic' } },
    { data: { properties: {} }, error: null },
  ])('fails explicitly when a fresh credential cannot be generated', async (result) => {
    generateLink.mockResolvedValue(result);
    await expect(
      service.resendVendorApplicationInvite(application.id, 'admin-id'),
    ).rejects.toMatchObject({
      response: {
        code: 'MAGIC_LINK_GENERATION_FAILED',
        message: 'Could not create a fresh setup link. Please try again.',
      },
    });
    expect(send).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it.each([
    { id: null, delivered: false },
    { id: null, delivered: true },
    { id: 'unexpected-id', delivered: false },
  ])('does not report a stub or unaccepted email as sent', async (result) => {
    send.mockResolvedValue(result);
    await expect(
      service.resendVendorApplicationInvite(application.id, 'admin-id'),
    ).rejects.toMatchObject({
      response: { code: 'INVITE_EMAIL_SEND_FAILED' },
    });
    expect(audit).not.toHaveBeenCalled();
  });

  it('reports a rejected send without exposing provider diagnostics, and permits retry', async () => {
    send.mockRejectedValueOnce(new Error('private provider failure'));
    await expect(
      service.resendVendorApplicationInvite(application.id, 'admin-id'),
    ).rejects.toMatchObject({
      response: {
        code: 'INVITE_EMAIL_SEND_FAILED',
        message: 'The invitation email could not be submitted. Please try again.',
      },
    });
    expect(audit).not.toHaveBeenCalled();
    await expect(
      service.resendVendorApplicationInvite(application.id, 'admin-id'),
    ).resolves.toMatchObject({ ok: true });
  });

  it('times out a stalled provider without auditing success', async () => {
    jest.useFakeTimers();
    send.mockReturnValue(new Promise(() => undefined));
    const assertion = expect(
      service.resendVendorApplicationInvite(application.id, 'admin-id'),
    ).rejects.toMatchObject({
      response: { code: 'INVITE_EMAIL_SEND_FAILED' },
    });
    await jest.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(audit).not.toHaveBeenCalled();
  });

  it('clears the timeout after successful submission', async () => {
    jest.useFakeTimers();
    await service.resendVendorApplicationInvite(application.id, 'admin-id');
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each(Object.values(UserRole))('enforces resend permissions for %s', (role) => {
    const context = {
      getHandler: () => AdminController.prototype.resendVendorApplicationInvite,
      getClass: () => AdminController,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'actor-id', role } }) }),
    } as unknown as ExecutionContext;
    const guard = new RolesGuard(new Reflector());
    if (role === UserRole.admin || role === UserRole.compliance) {
      expect(guard.canActivate(context)).toBe(true);
    } else {
      expect(() => guard.canActivate(context)).toThrow();
    }
  });
});
