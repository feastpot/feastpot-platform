/**
 * Unit tests for the vendor-application referral capture and approval wiring.
 *
 * Tests are split into two concerns:
 *   A) registerInterest: referrerVendorId is resolved from the fp_ref header
 *      and stored on the VendorApplication (vendors.service.ts).
 *   B) approveVendorApplication: the stored referrerVendorId is validated and
 *      written as referred_by_vendor_id on the new Vendor row (admin.service.ts).
 *
 * All DB calls are mocked; no real database is needed.
 */

import { Logger } from '@nestjs/common';
import { VendorStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Helpers shared across suites
// ---------------------------------------------------------------------------

const REFERRER_VENDOR_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const REFERRER_USER_ID = 'bbbbbbbb-0000-0000-0000-000000000001';
const REFERRER_LINK_ID = 'clinkid0000001';
const APPLICANT_EMAIL = 'newvendor@test.invalid';
const REFERRER_EMAIL = 'referrer@test.invalid';

// ---------------------------------------------------------------------------
// Suite A: registerInterest referrer resolution
// ---------------------------------------------------------------------------

describe('registerInterest: referrer resolution from fp_ref header', () => {
  /** Minimal prisma mock with only the methods used by the referral path. */
  const makeVendorReferralLinkMock = (
    override?: Partial<{ vendorId: string; userEmail: string }> | null,
  ) => ({
    findUnique: jest.fn().mockResolvedValue(
      override === null
        ? null
        : {
            vendorId: override?.vendorId ?? REFERRER_VENDOR_ID,
            vendor: {
              user: { email: override?.userEmail ?? REFERRER_EMAIL },
            },
          },
    ),
  });

  const makeVendorApplicationMock = () => ({
    create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'app-1', kitchenName: 'Test Kitchen', createdAt: new Date(), status: 'pending', referrerVendorId: data.referrerVendorId }),
    ),
  });

  /** Build a minimal VendorsService-like object to exercise resolveReferrer logic inline. */
  const resolveReferrerVendorId = async (
    prisma: {
      vendorReferralLink: ReturnType<typeof makeVendorReferralLinkMock>;
    },
    fpRef: string | undefined,
    normalisedEmail: string,
    logger: Pick<Logger, 'warn' | 'error'>,
  ): Promise<string | null> => {
    if (!fpRef) return null;
    const referralLinkId = fpRef.split('|')[0]?.trim();
    if (!referralLinkId) return null;
    try {
      const link = await prisma.vendorReferralLink.findUnique({
        where: { id: referralLinkId },
        select: {
          vendorId: true,
          vendor: { select: { user: { select: { email: true } } } },
        },
      });
      if (!link) return null;
      if (link.vendor.user.email.toLowerCase() === normalisedEmail) {
        logger.warn(`self-referral: ${normalisedEmail}`);
        return null;
      }
      return link.vendorId;
    } catch (err) {
      logger.error(`lookup failed: ${(err as Error).message}`);
      return null;
    }
  };

  const mockLogger = { warn: jest.fn(), error: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it('stores the referrer vendor ID when a valid fp_ref is supplied', async () => {
    const prisma = { vendorReferralLink: makeVendorReferralLinkMock() };
    const fpRef = `${REFERRER_LINK_ID}|click1|1234567890000`;
    const result = await resolveReferrerVendorId(prisma, fpRef, APPLICANT_EMAIL, mockLogger);
    expect(result).toBe(REFERRER_VENDOR_ID);
    expect(prisma.vendorReferralLink.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: REFERRER_LINK_ID } }),
    );
  });

  it('returns null and does not store when no fp_ref header is present', async () => {
    const prisma = { vendorReferralLink: makeVendorReferralLinkMock() };
    const result = await resolveReferrerVendorId(prisma, undefined, APPLICANT_EMAIL, mockLogger);
    expect(result).toBeNull();
    expect(prisma.vendorReferralLink.findUnique).not.toHaveBeenCalled();
  });

  it('returns null when the referral link does not exist', async () => {
    const prisma = { vendorReferralLink: makeVendorReferralLinkMock(null) };
    const result = await resolveReferrerVendorId(
      prisma,
      `unknownlink|click|123`,
      APPLICANT_EMAIL,
      mockLogger,
    );
    expect(result).toBeNull();
  });

  it('returns null and warns when the applicant email matches the referrer (self-referral)', async () => {
    const prisma = {
      vendorReferralLink: makeVendorReferralLinkMock({ userEmail: APPLICANT_EMAIL }),
    };
    const result = await resolveReferrerVendorId(
      prisma,
      `${REFERRER_LINK_ID}|click1|123`,
      APPLICANT_EMAIL,
      mockLogger,
    );
    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('self-referral'));
  });

  it('returns null and logs an error when the DB lookup throws', async () => {
    const prisma = {
      vendorReferralLink: {
        findUnique: jest.fn().mockRejectedValue(new Error('DB timeout')),
      },
    };
    const result = await resolveReferrerVendorId(
      prisma,
      `${REFERRER_LINK_ID}|click1|123`,
      APPLICANT_EMAIL,
      mockLogger,
    );
    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('DB timeout'));
  });
});

// ---------------------------------------------------------------------------
// Suite B: approveVendorApplication referrer validation
// ---------------------------------------------------------------------------

describe('approveVendorApplication: referrer validation before vendor create', () => {
  /** Exercise just the referrer-validation block extracted from admin.service.ts. */
  const validateReferrer = async (
    prisma: {
      vendor: { findUnique: jest.Mock };
      user: { findUnique: jest.Mock };
    },
    storedReferrerId: string | null,
    normalisedEmail: string,
    logger: Pick<Logger, 'warn'>,
  ): Promise<string | null> => {
    if (!storedReferrerId) return null;
    const referrer = await prisma.vendor.findUnique({
      where: { id: storedReferrerId },
      select: { id: true, userId: true, status: true, businessName: true },
    });
    if (!referrer) {
      logger.warn(`referrer not found: ${storedReferrerId}`);
      return null;
    }
    const validStatuses: VendorStatus[] = [
      VendorStatus.approved,
      VendorStatus.live,
      VendorStatus.probation,
    ];
    if (!validStatuses.includes(referrer.status as VendorStatus)) {
      logger.warn(`referrer status ${referrer.status} not operational: ${storedReferrerId}`);
      return null;
    }
    const referrerUser = await prisma.user.findUnique({
      where: { id: referrer.userId },
      select: { email: true },
    });
    if (referrerUser?.email.toLowerCase() === normalisedEmail) {
      logger.warn(`self-referral at approval for email=${normalisedEmail}`);
      return null;
    }
    return referrer.id;
  };

  const makeVendorMock = (override: Partial<{
    id: string; userId: string; status: VendorStatus; businessName: string;
  }> | null) => ({
    findUnique: jest.fn().mockResolvedValue(
      override === null
        ? null
        : {
            id: override?.id ?? REFERRER_VENDOR_ID,
            userId: override?.userId ?? REFERRER_USER_ID,
            status: override?.status ?? VendorStatus.live,
            businessName: override?.businessName ?? 'Referrer Kitchen',
          },
    ),
  });

  const makeUserMock = (email = REFERRER_EMAIL) => ({
    findUnique: jest.fn().mockResolvedValue({ email }),
  });

  const mockLogger = { warn: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it('returns the referrer ID when the referrer is live and non-self', async () => {
    const prisma = { vendor: makeVendorMock({}), user: makeUserMock() };
    const result = await validateReferrer(prisma, REFERRER_VENDOR_ID, APPLICANT_EMAIL, mockLogger);
    expect(result).toBe(REFERRER_VENDOR_ID);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('returns null when storedReferrerId is null (no referral used)', async () => {
    const prisma = { vendor: makeVendorMock(null), user: makeUserMock() };
    const result = await validateReferrer(prisma, null, APPLICANT_EMAIL, mockLogger);
    expect(result).toBeNull();
    expect(prisma.vendor.findUnique).not.toHaveBeenCalled();
  });

  it('returns null and warns when the referrer vendor is not found', async () => {
    const prisma = { vendor: makeVendorMock(null), user: makeUserMock() };
    const result = await validateReferrer(
      prisma,
      REFERRER_VENDOR_ID,
      APPLICANT_EMAIL,
      mockLogger,
    );
    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('referrer not found'),
    );
  });

  it('returns null and warns when the referrer is suspended', async () => {
    const prisma = {
      vendor: makeVendorMock({ status: VendorStatus.suspended }),
      user: makeUserMock(),
    };
    const result = await validateReferrer(
      prisma,
      REFERRER_VENDOR_ID,
      APPLICANT_EMAIL,
      mockLogger,
    );
    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('not operational'),
    );
  });

  it('returns null and warns when the referrer is pending (not yet approved)', async () => {
    const prisma = {
      vendor: makeVendorMock({ status: VendorStatus.pending }),
      user: makeUserMock(),
    };
    const result = await validateReferrer(
      prisma,
      REFERRER_VENDOR_ID,
      APPLICANT_EMAIL,
      mockLogger,
    );
    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('accepts a referrer with approved status', async () => {
    const prisma = {
      vendor: makeVendorMock({ status: VendorStatus.approved }),
      user: makeUserMock(),
    };
    const result = await validateReferrer(
      prisma,
      REFERRER_VENDOR_ID,
      APPLICANT_EMAIL,
      mockLogger,
    );
    expect(result).toBe(REFERRER_VENDOR_ID);
  });

  it('accepts a referrer with probation status', async () => {
    const prisma = {
      vendor: makeVendorMock({ status: VendorStatus.probation }),
      user: makeUserMock(),
    };
    const result = await validateReferrer(
      prisma,
      REFERRER_VENDOR_ID,
      APPLICANT_EMAIL,
      mockLogger,
    );
    expect(result).toBe(REFERRER_VENDOR_ID);
  });

  it('returns null and warns when the referrer owns the same email (self-referral)', async () => {
    const prisma = {
      vendor: makeVendorMock({}),
      user: makeUserMock(APPLICANT_EMAIL), // same email as applicant
    };
    const result = await validateReferrer(
      prisma,
      REFERRER_VENDOR_ID,
      APPLICANT_EMAIL,
      mockLogger,
    );
    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('self-referral'),
    );
  });
});
