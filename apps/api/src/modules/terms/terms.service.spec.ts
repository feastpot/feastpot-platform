import { BadRequestException } from '@nestjs/common';
import { AcceptanceMethod, TermsDocumentType } from '@prisma/client';
import type { Queue } from 'bull';

import type { PrismaService } from '../../prisma/prisma.service';

import {
  buildVendorTermsAcceptanceLabel,
  GENERATE_ACCEPTANCE_PDF_JOB,
  TermsService,
} from './terms.service';

const now = new Date('2026-08-31T12:00:00.000Z');

function version(overrides: Record<string, unknown> = {}) {
  return {
    id: 'terms-v1',
    documentType: TermsDocumentType.VENDOR_TERMS,
    version: '1.0',
    contentMdx: '# Vendor Terms',
    contentHash: 'a'.repeat(64),
    changeSummary: 'Initial terms',
    isMaterial: true,
    publishedAt: new Date('2026-05-01T00:00:00.000Z'),
    effectiveAt: new Date('2026-05-01T00:00:00.000Z'),
    supersededAt: new Date('2026-08-08T00:00:00.000Z'),
    createdBy: 'legal',
    solicitorSignOff: 'Reviewed and approved',
    ...overrides,
  };
}

describe('TermsService legal invariants', () => {
  let prisma: {
    termsVersion: {
      findFirst: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
    };
    termsAcceptance: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
    vendor: { update: jest.Mock };
    $transaction: jest.Mock;
  };
  let queue: { add: jest.Mock };
  let service: TermsService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    prisma = {
      termsVersion: {
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      termsAcceptance: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      vendor: { update: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => unknown) =>
      callback(prisma),
    );
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    service = new TermsService(prisma as unknown as PrismaService, queue as unknown as Queue);
  });

  afterEach(() => jest.useRealTimers());

  it('selects the latest effective version even if stale data marked it superseded', async () => {
    prisma.termsVersion.findFirst.mockResolvedValue(version());

    await expect(service.getCurrentVersion(TermsDocumentType.VENDOR_TERMS)).resolves.toMatchObject({
      id: 'terms-v1',
    });
    expect(prisma.termsVersion.findFirst).toHaveBeenCalledWith({
      where: {
        documentType: TermsDocumentType.VENDOR_TERMS,
        effectiveAt: { lte: now },
      },
      orderBy: [{ effectiveAt: 'desc' }, { publishedAt: 'desc' }],
    });
  });

  it('keeps the effective version current while a material replacement is pending', async () => {
    const pending = version({
      id: 'terms-v2',
      version: '2.0',
      effectiveAt: new Date('2026-09-23T00:00:00.000Z'),
      supersededAt: null,
    });
    prisma.termsVersion.create.mockResolvedValue(pending);

    await service.publishVersion({
      documentType: TermsDocumentType.VENDOR_TERMS,
      version: '2.0',
      contentMdx: pending.contentMdx,
      changeSummary: 'Material replacement',
      isMaterial: true,
      effectiveAt: pending.effectiveAt.toISOString(),
      createdBy: 'legal',
      solicitorSignOff: 'Reviewed and approved',
    });

    expect(prisma.termsVersion.updateMany).not.toHaveBeenCalled();
    expect(prisma.termsVersion.create).toHaveBeenCalled();
  });

  it('rejects a material version published with under 15 days notice', async () => {
    await expect(
      service.publishVersion({
        documentType: TermsDocumentType.VENDOR_TERMS,
        version: '2.0',
        contentMdx: '# Updated terms',
        changeSummary: 'Material replacement',
        isMaterial: true,
        effectiveAt: '2026-09-10T00:00:00.000Z',
        createdBy: 'legal',
        solicitorSignOff: 'Reviewed and approved',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('records all click-wrap evidence and unlocks setup in the same transaction', async () => {
    const current = version({ supersededAt: null });
    const acceptance = {
      id: 'acceptance-1',
      vendorId: 'vendor-1',
      termsVersionId: current.id,
      acceptedAt: now,
    };
    prisma.termsVersion.findFirst.mockResolvedValue(current);
    prisma.termsAcceptance.upsert.mockResolvedValue(acceptance);
    prisma.vendor.update.mockResolvedValue({ id: 'vendor-1' });
    const acceptanceText = buildVendorTermsAcceptanceLabel(current.version);

    await service.acceptVersion(
      'vendor-1',
      current.id,
      { acceptanceText, scrolledToEnd: true },
      '203.0.113.10',
      'test-browser',
    );

    expect(prisma.termsAcceptance.upsert).toHaveBeenCalledWith({
      where: {
        vendorId_termsVersionId: {
          vendorId: 'vendor-1',
          termsVersionId: current.id,
        },
      },
      create: {
        vendorId: 'vendor-1',
        termsVersionId: current.id,
        ipAddress: '203.0.113.10',
        userAgent: 'test-browser',
        acceptanceText,
        contentHash: current.contentHash,
        scrolledToEnd: true,
        method: AcceptanceMethod.CLICKWRAP,
      },
      update: {},
    });
    expect(prisma.vendor.update).toHaveBeenCalledWith({
      where: { id: 'vendor-1' },
      data: { termsActivatedAt: now },
    });
    expect(queue.add).toHaveBeenCalledWith(
      GENERATE_ACCEPTANCE_PDF_JOB,
      { acceptanceId: acceptance.id },
      expect.objectContaining({ jobId: `terms-acceptance-pdf:${acceptance.id}` }),
    );
  });

  it('does not enqueue evidence when atomic account activation fails', async () => {
    const current = version({ supersededAt: null });
    prisma.termsVersion.findFirst.mockResolvedValue(current);
    prisma.termsAcceptance.upsert.mockResolvedValue({
      id: 'acceptance-1',
      acceptedAt: now,
    });
    prisma.vendor.update.mockRejectedValue(new Error('activation failed'));

    await expect(
      service.acceptVersion(
        'vendor-1',
        current.id,
        {
          acceptanceText: buildVendorTermsAcceptanceLabel(current.version),
          scrolledToEnd: true,
        },
        '203.0.113.10',
        'test-browser',
      ),
    ).rejects.toThrow('activation failed');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'wrong version',
      id: 'terms-v2',
      label: buildVendorTermsAcceptanceLabel('1.0'),
      scrolled: true,
      ip: '203.0.113.10',
      ua: 'test-browser',
    },
    {
      name: 'altered label',
      id: 'terms-v1',
      label: 'I agree',
      scrolled: true,
      ip: '203.0.113.10',
      ua: 'test-browser',
    },
    {
      name: 'not scrolled',
      id: 'terms-v1',
      label: buildVendorTermsAcceptanceLabel('1.0'),
      scrolled: false,
      ip: '203.0.113.10',
      ua: 'test-browser',
    },
    {
      name: 'missing request metadata',
      id: 'terms-v1',
      label: buildVendorTermsAcceptanceLabel('1.0'),
      scrolled: true,
      ip: undefined,
      ua: undefined,
    },
  ])(
    'rejects incomplete or mismatched evidence: $name',
    async ({ id, label, scrolled, ip, ua }) => {
      prisma.termsVersion.findFirst.mockResolvedValue(version({ supersededAt: null }));
      await expect(
        service.acceptVersion(
          'vendor-1',
          id,
          { acceptanceText: label, scrolledToEnd: scrolled },
          ip,
          ua,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.termsAcceptance.upsert).not.toHaveBeenCalled();
    },
  );
});
