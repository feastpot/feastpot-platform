import { BadRequestException } from '@nestjs/common';
import { TermsDocumentType } from '@prisma/client';

import { realTermsVendorWhere } from './current-terms';
import { TermsService } from './terms.service';

describe('real terms coverage and effective state', () => {
  it('rejects supersession with a backdated replacement that would not become current', async () => {
    const updateMany = jest.fn();
    const tx = {
      termsVersion: {
        findFirst: jest.fn().mockResolvedValue({ effectiveAt: new Date('2022-01-01') }),
        updateMany,
      },
    };
    const service = new TermsService(
      {
        $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
      } as never,
      {} as never,
    );
    await expect(
      service.publishVersion({
        documentType: TermsDocumentType.VENDOR_TERMS,
        version: '2.2',
        contentMdx: '# Terms',
        changeSummary: 'Editorial correction',
        isMaterial: false,
        effectiveAt: '2021-01-01',
        createdBy: 'legal',
        solicitorSignOff: 'Reviewed and approved',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMany).not.toHaveBeenCalled();
  });
  it('excludes fixture vendors and counts the current acceptance, not the newest unrelated one', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'real-vendor',
        businessName: 'Vendor',
        status: 'live',
        termsAcceptances: [
          { termsVersion: { id: 'future', version: '3.0' } },
          { termsVersion: { id: 'current', version: '2.0' } },
        ],
      },
    ]);
    const service = new TermsService(
      {
        termsVersion: { findFirst: jest.fn().mockResolvedValue({ id: 'current', version: '2.0' }) },
        vendor: { findMany },
      } as never,
      {} as never,
    );
    const result = await service.adminCoverage();
    expect(result.totalActive).toBe(1);
    expect(result.onCurrentCount).toBe(1);
    expect(findMany.mock.calls[0][0].where).toMatchObject(realTermsVendorWhere);
  });

  it('reports no denominator as unknown coverage, not 100% compliance', async () => {
    const service = new TermsService(
      {
        termsVersion: { findFirst: jest.fn().mockResolvedValue({ id: 'current' }) },
        vendor: { findMany: jest.fn().mockResolvedValue([]) },
      } as never,
      {} as never,
    );
    await expect(service.adminCoverage()).resolves.toMatchObject({
      totalActive: 0,
      onCurrentCount: 0,
      coveragePct: null,
    });
  });

  it('shows exactly one effective version despite stale supersession flags and a pending replacement', async () => {
    const versions = [
      {
        id: 'old',
        documentType: TermsDocumentType.VENDOR_TERMS,
        effectiveAt: new Date('2020-01-01'),
        publishedAt: new Date('2020-01-01'),
        supersededAt: null,
      },
      {
        id: 'current',
        documentType: TermsDocumentType.VENDOR_TERMS,
        effectiveAt: new Date('2021-01-01'),
        publishedAt: new Date('2021-01-01'),
        supersededAt: new Date('2020-12-01'),
      },
      {
        id: 'pending',
        documentType: TermsDocumentType.VENDOR_TERMS,
        effectiveAt: new Date('2100-01-01'),
        publishedAt: new Date('2022-01-01'),
        supersededAt: null,
      },
    ];
    const service = new TermsService(
      {
        termsVersion: { findMany: jest.fn().mockResolvedValue(versions) },
        vendor: { findMany: jest.fn().mockResolvedValue([]) },
      } as never,
      {} as never,
    );
    const result = await service.adminListAllVersions();
    expect(result.map((v) => v.status)).toEqual(['superseded', 'live', 'pending']);
  });

  it.each([
    { version: 'part-b-1788799279281', effectiveAt: '2026-01-01' },
    { version: '2.2', effectiveAt: 'not-a-date' },
    { version: '2.2', effectiveAt: '2026-01-01', contentMdx: '' },
  ])(
    'rejects invalid replacement metadata without superseding any version: %j',
    async (override) => {
      const transaction = jest.fn();
      const service = new TermsService({ $transaction: transaction } as never, {} as never);
      await expect(
        service.publishVersion({
          documentType: TermsDocumentType.VENDOR_TERMS,
          version: '2.2',
          contentMdx: '# Terms',
          changeSummary: 'Editorial correction',
          isMaterial: false,
          effectiveAt: '2026-01-01',
          createdBy: 'legal',
          solicitorSignOff: 'Reviewed and approved',
          ...override,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transaction).not.toHaveBeenCalled();
    },
  );
});
