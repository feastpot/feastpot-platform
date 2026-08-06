import {
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { TrustSignalStatus, TrustSignalType, UserRole } from '@prisma/client';
import request from 'supertest';

import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PrismaService } from '../../prisma/prisma.service';

import {
  getVendorTrustSignals,
  listVendorTrustSignalsForAdmin,
  ALL_TRUST_SIGNAL_TYPES,
} from './vendor-capacity';
import { VendorTrustSignalsController } from './vendor-trust-signals.controller';

/**
 * Pins down the staff-only trust-signal review surface:
 *   GET   /v1/admin/vendors/:vendorId/trust-signals
 *   PATCH /v1/admin/vendors/:vendorId/trust-signals/:signalType
 *
 * Regressions these tests exist to catch:
 *  - the admin list dropping one of the seven signal types (or losing the
 *    synthetic `not_provided` placeholders);
 *  - the PATCH upsert forgetting to stamp verified_by / verified_at;
 *  - the DTO accepting vendor-side statuses (`submitted` / `not_provided`);
 *  - the @Roles matrix being loosened (support must stay read-only);
 *  - the public read helper leaking non-verified signals to customers.
 */

const VENDOR_ID = '3f0b2f4e-9a1c-4d9e-8b6a-1c2d3e4f5a6b';
const STAFF_ID = 'a1b2c3d4-0000-4000-8000-000000000001';

describe('VendorTrustSignalsController (HTTP)', () => {
  let app: INestApplication;
  let vendorFindUnique: jest.Mock;
  let signalFindMany: jest.Mock;
  let signalUpsert: jest.Mock;
  // The role injected into req.user by the fake auth middleware below.
  let currentUser: { id: string; email: string; role: UserRole } | null;

  beforeAll(async () => {
    vendorFindUnique = jest.fn();
    signalFindMany = jest.fn();
    signalUpsert = jest.fn();

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [VendorTrustSignalsController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            vendor: { findUnique: vendorFindUnique },
            vendorTrustSignal: { findMany: signalFindMany, upsert: signalUpsert },
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirror main.ts: URI versioning + whitelisting ValidationPipe (which is
    // what rejects bad DTO statuses with a 400).
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    // Stand-in for the Supabase auth layer: attaches the configured user so
    // @CurrentUser works. Role *enforcement* is covered separately below via
    // the real RolesGuard against the real decorator metadata.
    app.use((req: { user?: unknown }, _res: unknown, next: () => void) => {
      req.user = currentUser;
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vendorFindUnique.mockReset().mockResolvedValue({ id: VENDOR_ID });
    signalFindMany.mockReset().mockResolvedValue([]);
    signalUpsert.mockReset();
    currentUser = { id: STAFF_ID, email: 'staff@feastpot.co.uk', role: UserRole.compliance };
  });

  describe('GET (admin list)', () => {
    it('returns all seven signal types as not_provided placeholders when no rows exist', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/admin/vendors/${VENDOR_ID}/trust-signals`)
        .expect(200);

      expect(res.body).toHaveLength(7);
      expect(res.body.map((s: { signalType: string }) => s.signalType)).toEqual(
        ALL_TRUST_SIGNAL_TYPES,
      );
      for (const signal of res.body) {
        expect(signal).toMatchObject({
          id: null,
          vendorId: VENDOR_ID,
          status: TrustSignalStatus.not_provided,
          evidenceReference: null,
          verifiedAt: null,
          verifiedBy: null,
        });
      }
    });

    it('merges existing DB rows with placeholders (still exactly seven entries)', async () => {
      const verifiedAt = new Date('2026-07-01T10:00:00.000Z');
      signalFindMany.mockResolvedValueOnce([
        {
          id: 'row-1',
          vendorId: VENDOR_ID,
          signalType: TrustSignalType.hygiene_rating,
          status: TrustSignalStatus.verified,
          evidenceReference: 'FHRS 5 - 12345',
          verifiedAt,
          verifiedBy: STAFF_ID,
          updatedAt: verifiedAt,
        },
      ]);

      const res = await request(app.getHttpServer())
        .get(`/v1/admin/vendors/${VENDOR_ID}/trust-signals`)
        .expect(200);

      expect(res.body).toHaveLength(7);
      const hygiene = res.body.find(
        (s: { signalType: string }) => s.signalType === TrustSignalType.hygiene_rating,
      );
      expect(hygiene).toMatchObject({
        id: 'row-1',
        status: TrustSignalStatus.verified,
        verifiedBy: STAFF_ID,
        evidenceReference: 'FHRS 5 - 12345',
      });
      // Everything else stays a placeholder.
      const others = res.body.filter(
        (s: { signalType: string }) => s.signalType !== TrustSignalType.hygiene_rating,
      );
      expect(
        others.every((s: { status: string }) => s.status === TrustSignalStatus.not_provided),
      ).toBe(true);
    });

    it('404s with VENDOR_NOT_FOUND for an unknown vendor', async () => {
      vendorFindUnique.mockResolvedValueOnce(null);
      const res = await request(app.getHttpServer())
        .get(`/v1/admin/vendors/${VENDOR_ID}/trust-signals`)
        .expect(404);
      expect(res.body.code).toBe('VENDOR_NOT_FOUND');
      expect(signalFindMany).not.toHaveBeenCalled();
    });

    it('400s on a non-UUID vendorId', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/vendors/not-a-uuid/trust-signals')
        .expect(400);
    });
  });

  describe('PATCH (verify / expire)', () => {
    it('upserts with status + verifiedAt + verifiedBy = acting staff user', async () => {
      signalUpsert.mockImplementationOnce((args: { create: unknown }) =>
        Promise.resolve(args.create),
      );

      await request(app.getHttpServer())
        .patch(`/v1/admin/vendors/${VENDOR_ID}/trust-signals/${TrustSignalType.hygiene_rating}`)
        .send({ status: TrustSignalStatus.verified, evidenceReference: 'FHRS 5' })
        .expect(200);

      expect(signalUpsert).toHaveBeenCalledTimes(1);
      const args = signalUpsert.mock.calls[0][0];
      expect(args.where).toEqual({
        vendorId_signalType: {
          vendorId: VENDOR_ID,
          signalType: TrustSignalType.hygiene_rating,
        },
      });
      // Both branches of the upsert must stamp the audit fields - a
      // regression dropping verified_by on either path is exactly what
      // this test exists to catch.
      for (const branch of [args.create, args.update]) {
        expect(branch.status).toBe(TrustSignalStatus.verified);
        expect(branch.verifiedBy).toBe(STAFF_ID);
        expect(branch.verifiedAt).toBeInstanceOf(Date);
      }
      expect(args.create.evidenceReference).toBe('FHRS 5');
      expect(args.update.evidenceReference).toBe('FHRS 5');
    });

    it('accepts "expired" and stamps the same audit fields', async () => {
      signalUpsert.mockResolvedValueOnce({});
      await request(app.getHttpServer())
        .patch(`/v1/admin/vendors/${VENDOR_ID}/trust-signals/${TrustSignalType.identity_check}`)
        .send({ status: TrustSignalStatus.expired })
        .expect(200);
      const args = signalUpsert.mock.calls[0][0];
      expect(args.create.status).toBe(TrustSignalStatus.expired);
      expect(args.update.status).toBe(TrustSignalStatus.expired);
      expect(args.update.verifiedBy).toBe(STAFF_ID);
      // No evidenceReference sent → update branch must NOT touch the
      // stored evidence.
      expect('evidenceReference' in args.update).toBe(false);
    });

    it.each([TrustSignalStatus.not_provided, TrustSignalStatus.submitted, 'bogus'])(
      'rejects vendor-side/unknown status %s with 400 and never hits the DB',
      async (status) => {
        await request(app.getHttpServer())
          .patch(`/v1/admin/vendors/${VENDOR_ID}/trust-signals/${TrustSignalType.hygiene_rating}`)
          .send({ status })
          .expect(400);
        expect(signalUpsert).not.toHaveBeenCalled();
      },
    );

    it('rejects an unknown signalType with 400', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/admin/vendors/${VENDOR_ID}/trust-signals/not_a_signal`)
        .send({ status: TrustSignalStatus.verified })
        .expect(400);
      expect(signalUpsert).not.toHaveBeenCalled();
    });

    it('401s when no authenticated user is attached', async () => {
      currentUser = null;
      await request(app.getHttpServer())
        .patch(`/v1/admin/vendors/${VENDOR_ID}/trust-signals/${TrustSignalType.hygiene_rating}`)
        .send({ status: TrustSignalStatus.verified })
        .expect(401);
      expect(signalUpsert).not.toHaveBeenCalled();
    });

    it('404s for an unknown vendor before writing anything', async () => {
      vendorFindUnique.mockResolvedValueOnce(null);
      await request(app.getHttpServer())
        .patch(`/v1/admin/vendors/${VENDOR_ID}/trust-signals/${TrustSignalType.hygiene_rating}`)
        .send({ status: TrustSignalStatus.verified })
        .expect(404);
      expect(signalUpsert).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Role enforcement - same decorator-metadata + real-RolesGuard technique as
// admin.controller.spec.ts, so widening @Roles in a future PR fails here.
// ---------------------------------------------------------------------------

describe('VendorTrustSignalsController role matrix', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  function rolesOn(method: string): UserRole[] {
    const proto = VendorTrustSignalsController.prototype as unknown as Record<
      string,
      (...args: never[]) => unknown
    >;
    return Reflect.getMetadata(ROLES_KEY, proto[method]) as UserRole[];
  }

  function ctxFor(method: string, role: UserRole | null): ExecutionContext {
    const proto = VendorTrustSignalsController.prototype as unknown as Record<
      string,
      (...args: never[]) => unknown
    >;
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { id: 'u', email: 'u@e', role } : null }),
      }),
      getHandler: () => proto[method],
      getClass: () => VendorTrustSignalsController,
    } as unknown as ExecutionContext;
  }

  it('declares the exact role sets (support is read-only)', () => {
    expect(new Set(rolesOn('list'))).toEqual(
      new Set([UserRole.admin, UserRole.compliance, UserRole.support]),
    );
    expect(new Set(rolesOn('update'))).toEqual(new Set([UserRole.admin, UserRole.compliance]));
  });

  it('allows admin/compliance/support to GET', () => {
    for (const role of [UserRole.admin, UserRole.compliance, UserRole.support]) {
      expect(guard.canActivate(ctxFor('list', role))).toBe(true);
    }
  });

  it('rejects vendor/customer/finance from GET with 403', () => {
    for (const role of [UserRole.vendor, UserRole.customer, UserRole.finance]) {
      expect(() => guard.canActivate(ctxFor('list', role))).toThrow(ForbiddenException);
    }
  });

  it('allows only admin/compliance to PATCH', () => {
    expect(guard.canActivate(ctxFor('update', UserRole.admin))).toBe(true);
    expect(guard.canActivate(ctxFor('update', UserRole.compliance))).toBe(true);
  });

  it('rejects support (read-only), vendor, customer, finance and anonymous from PATCH', () => {
    for (const role of [UserRole.support, UserRole.vendor, UserRole.customer, UserRole.finance]) {
      expect(() => guard.canActivate(ctxFor('update', role))).toThrow(ForbiddenException);
    }
    expect(() => guard.canActivate(ctxFor('update', null))).toThrow(ForbiddenException);
  });
});

// ---------------------------------------------------------------------------
// Public read layer - customers must never see non-verified signals.
// ---------------------------------------------------------------------------

describe('getVendorTrustSignals (public read layer)', () => {
  it('filters to status=verified by default', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const db = { vendorTrustSignal: { findMany } } as unknown as Parameters<
      typeof getVendorTrustSignals
    >[0];

    await getVendorTrustSignals(db, VENDOR_ID_PUBLIC);

    expect(findMany).toHaveBeenCalledWith({
      where: { vendorId: VENDOR_ID_PUBLIC, status: TrustSignalStatus.verified },
      orderBy: { signalType: 'asc' },
    });
  });

  it('only widens past verified when includeUnverified is explicitly true', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const db = { vendorTrustSignal: { findMany } } as unknown as Parameters<
      typeof getVendorTrustSignals
    >[0];

    await getVendorTrustSignals(db, VENDOR_ID_PUBLIC, true);

    expect(findMany).toHaveBeenCalledWith({
      where: { vendorId: VENDOR_ID_PUBLIC },
      orderBy: { signalType: 'asc' },
    });
  });

  it('ALL_TRUST_SIGNAL_TYPES stays in lockstep with the Prisma enum (seven types)', () => {
    expect(ALL_TRUST_SIGNAL_TYPES).toEqual(Object.values(TrustSignalType));
    expect(ALL_TRUST_SIGNAL_TYPES).toHaveLength(7);
  });

  it('listVendorTrustSignalsForAdmin queries WITHOUT a status filter (staff see everything)', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const db = { vendorTrustSignal: { findMany } } as unknown as Parameters<
      typeof listVendorTrustSignalsForAdmin
    >[0];

    await listVendorTrustSignalsForAdmin(db, VENDOR_ID_PUBLIC);

    expect(findMany).toHaveBeenCalledWith({ where: { vendorId: VENDOR_ID_PUBLIC } });
  });
});

const VENDOR_ID_PUBLIC = 'b2c3d4e5-1111-4222-8333-444455556666';
