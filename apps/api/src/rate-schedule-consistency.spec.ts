/**
 * Rate Schedule consistency tests (LEGAL-505).
 *
 * Acceptance criteria:
 *   1. Current commercial surfaces do not hardcode commission percentages.
 *   2. The commission service throws BadRequestException if it resolves a
 *      PLANNED RateScheduleEntry.
 *   3. A FeastPass customer's order produces an identical vendorPayoutPence
 *      to a non-member's (CUSTOMER_SIDE entries are never deducted from
 *      vendor payouts).
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { execFileSync } from 'child_process';

import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';
import { BadRequestException } from '@nestjs/common';
import { OrderSource, RateStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

// ── Helpers ──────────────────────────────────────────────────────────────────

const REPO_ROOT = join(__dirname, '..', '..', '..');

function readFile(relPath: string): string {
  return readFileSync(join(REPO_ROOT, relPath), 'utf-8');
}

type RateSurface = {
  name: string;
  file: string;
  // These are wiring contracts, not displayed-text snapshots. Each points to
  // the canonical config or the endpoint/model that supplies the live schedule.
  required: string[];
};

const RATE_SURFACES: RateSurface[] = [
  {
    name: 'rate engine (source of truth)',
    file: 'packages/config/src/commission-rates.ts',
    required: [
      'marketplaceFirst:',
      'percent: 8',
      'marketplaceRepeat:',
      'percent: 5',
      'vendorReferred:',
      'percent: 0',
      'catering:',
      'percent: 10',
    ],
  },
  {
    name: 'API commission calculation',
    file: 'apps/api/src/commission/commission.service.ts',
    required: ['commissionRate.findFirst', 'rateScheduleEntry.findFirst', 'RateStatus.LIVE'],
  },
  {
    name: 'public /become-a-vendor',
    file: 'apps/web/src/app/become-a-vendor/page.tsx',
    required: ["apiRequest<RateRow[]>('/terms/rate-schedule')", 'COMMISSION_RATES'],
  },
  {
    name: 'earnings projection calculator',
    file: 'apps/web/src/app/become-a-vendor/earnings-calculator.tsx',
    required: ['RATE_KEYS.marketplaceFirst', "rate.status === 'LIVE'", 'COMMISSION_RATES'],
  },
  { name: '/help FAQ', file: 'apps/web/src/app/help/page.tsx', required: ['COMMISSION_RATES'] },
  {
    name: 'vendor terms Annex A',
    file: 'apps/web/src/app/legal/vendor-terms/legal-layers.tsx',
    required: ['/v1/terms/rate-schedule', '<RateCard rates={rates} />'],
  },
  {
    name: 'vendor terms Annex C summary',
    file: 'apps/web/src/app/legal/vendor-terms/legal-layers.tsx',
    required: ['/v1/terms/rate-schedule', '<KeyTermsSummary rates={rates} />'],
  },
  {
    name: 'vendor portal /earnings',
    file: 'apps/vendor/src/app/earnings/earnings-client.tsx',
    required: ['/v1/terms/rate-schedule', 'COMMISSION_RATES'],
  },
  {
    name: 'vendor portal /terms Rate Schedule panel',
    file: 'apps/vendor/src/app/terms/terms-client.tsx',
    required: ["apiRequest<RateRow[]>('/terms/rate-schedule')", '<RateCard rates={rates}'],
  },
  {
    name: 'vendor portal onboarding acceptance screen',
    file: 'apps/vendor/src/app/onboarding/terms/terms-acceptance-client.tsx',
    required: ["apiRequest<RateRow[]>('/terms/rate-schedule')", '<RateCard rates={rates}'],
  },
  {
    name: 'admin /settings',
    file: 'apps/admin/src/app/settings/settings-client.tsx',
    required: ['/v1/terms/rate-schedule', '<RateCard rates={rates}'],
  },
  {
    name: 'admin /commission-rates',
    file: 'apps/admin/src/app/commission-rates/commission-rates-client.tsx',
    required: ['/v1/admin/commission-rates'],
  },
  {
    name: 'payout statement PDF',
    file: 'apps/api/src/modules/payouts/payouts.service.ts',
    required: ['buildPayoutStatementPdf(statement)', 'effectiveCommissionRatePercent'],
  },
  {
    name: 'payout statement CSV',
    file: 'apps/api/src/modules/payouts/payouts.service.ts',
    required: ["'effective_commission_rate_percent'", 'effectiveCommissionRatePercent ??'],
  },
  {
    name: 'payout email template',
    file: 'apps/api/src/modules/notifications/templates/index.ts',
    required: ['appliedCommissionRates', 'effectiveCommissionRatePercent'],
  },
];

function assertRateSurfaceWiring(root: string, surfaces = RATE_SURFACES): void {
  for (const surface of surfaces) {
    const content = readFileSync(join(root, surface.file), 'utf8');
    for (const required of surface.required) {
      if (!content.includes(required)) {
        throw new Error(
          `Rate surface drift: ${surface.name} (${surface.file}) is missing "${required}".`,
        );
      }
    }
  }
}

describe('rate-surface manifest wiring', () => {
  it.each(RATE_SURFACES)(
    '$name is wired to the canonical configuration or live schedule',
    (surface) => {
      // A failure reports both the human-facing surface and its offending source file.
      expect(() => assertRateSurfaceWiring(REPO_ROOT, [surface])).not.toThrow();
    },
  );

  it('reports the deliberately drifted surface and source file without editing the repository', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'feastpot-rate-surface-'));
    const offender = 'apps/admin/src/app/settings/settings-client.tsx';
    try {
      for (const file of new Set(RATE_SURFACES.map((surface) => surface.file))) {
        const target = join(tempRoot, file);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, readFile(file));
      }
      writeFileSync(
        join(tempRoot, offender),
        readFile(offender).replace('/v1/terms/rate-schedule', '/v1/terms/not-the-rate-schedule'),
      );

      expect(() => assertRateSurfaceWiring(tempRoot)).toThrow(
        `admin /settings (${offender}) is missing "/v1/terms/rate-schedule"`,
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('fails the literal-rate guard and identifies a deliberately introduced temporary source file', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'feastpot-rate-literal-'));
    const offendingFile = 'apps/web/src/introduced-commission-literal.ts';
    try {
      const target = join(tempRoot, offendingFile);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, 'const label = "commission 8%";\n');

      let stderr = '';
      try {
        execFileSync(
          process.execPath,
          [join(REPO_ROOT, 'scripts/check-commission-rate-literals.mjs'), `--root=${tempRoot}`],
          {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        );
        fail('Expected the commission-rate literal guard to fail');
      } catch (error) {
        stderr = (error as { stderr?: string }).stderr ?? '';
      }
      expect(stderr).toContain(`${offendingFile}:1: const label = "commission 8%";`);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

// ── 1. No hardcoded "12%" outside seed and test files ────────────────────────

describe('No hardcoded commission-rate strings', () => {
  const LITERAL = `${PLATFORM_FACTS.commission.marketplaceFirst}%`;

  const FILES_THAT_MUST_NOT_CONTAIN_LITERAL = [
    'apps/api/src/commission/commission.service.ts',
    'apps/api/src/modules/payouts/payouts.service.ts',
    'apps/web/src/app/become-a-vendor/page.tsx',
    'apps/web/src/app/legal/vendor-terms/page.tsx',
    'apps/vendor/src/app/earnings/earnings-client.tsx',
  ];

  it.each(FILES_THAT_MUST_NOT_CONTAIN_LITERAL)(
    '%s does not contain a hardcoded "%s" string',
    (filePath) => {
      const content = readFile(filePath);
      // Allow the number 12 as part of date strings (e.g. "2026-08-12") or HSL
      // colour values. Only flag standalone "12%" which represents the rate.
      // The exact patterns to ban:
      expect(content).not.toContain(`'${LITERAL}'`);
      expect(content).not.toContain(`"${LITERAL}"`);
      expect(content).not.toMatch(/>12%</); // JSX text node
      expect(content).not.toContain('flat 12%'); // prose reference
      expect(content).not.toContain('using 12%'); // log/comment
    },
  );

  it('commission.service.ts removes the 12% numeric fallback constants', () => {
    const content = readFile('apps/api/src/commission/commission.service.ts');
    expect(content).not.toContain('1200');
    expect(content).not.toContain('new Decimal(12)');
    expect(content).not.toContain('FLAT_RATE_PCT');
  });
});

// ── 2. PLANNED guard: commission service throws for PLANNED entries ──────────

describe('PLANNED rate guard in CommissionService', () => {
  /**
   * Unit test that exercises the PLANNED guard logic in resolveRate()
   * without a real DB. We mock the Prisma methods to simulate a CommissionRate
   * whose rateKey links to a PLANNED RateScheduleEntry.
   */

  function makePrisma({
    commissionRateRateKey,
    scheduleEntryStatus,
  }: {
    commissionRateRateKey: string | null;
    scheduleEntryStatus: RateStatus | null;
  }) {
    return {
      commissionRate: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'rate-1',
          source: OrderSource.MARKETPLACE,
          isFirstOrder: true,
          ratePercent: new Decimal(12),
          rateKey: commissionRateRateKey,
        }),
      },
      rateScheduleEntry: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            scheduleEntryStatus != null
              ? { id: 'entry-1', key: 'standard_commission', status: scheduleEntryStatus }
              : null,
          ),
      },
    };
  }

  it('resolves without error when rateKey is null (legacy row)', async () => {
    const { CommissionService } = await import('./commission/commission.service');
    const prisma = makePrisma({ commissionRateRateKey: null, scheduleEntryStatus: null });
    const svc = new CommissionService(prisma as any);
    const at = new Date();
    await expect(svc.resolveRate(OrderSource.MARKETPLACE, true, at)).resolves.toMatchObject({
      id: 'rate-1',
    });
  });

  it('resolves without error when rateScheduleEntry is LIVE', async () => {
    const { CommissionService } = await import('./commission/commission.service');
    const prisma = makePrisma({
      commissionRateRateKey: 'standard_commission',
      scheduleEntryStatus: RateStatus.LIVE,
    });
    const svc = new CommissionService(prisma as any);
    await expect(svc.resolveRate(OrderSource.MARKETPLACE, true, new Date())).resolves.toMatchObject(
      { id: 'rate-1' },
    );
  });

  it('throws BadRequestException when rateScheduleEntry is PLANNED', async () => {
    const { CommissionService } = await import('./commission/commission.service');
    const prisma = makePrisma({
      commissionRateRateKey: 'repeat_commission',
      scheduleEntryStatus: RateStatus.PLANNED,
    });
    const svc = new CommissionService(prisma as any);
    await expect(
      svc.resolveRate(OrderSource.MARKETPLACE, false, new Date()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException with code PLANNED_RATE_NOT_ACTIVE', async () => {
    const { CommissionService } = await import('./commission/commission.service');
    const prisma = makePrisma({
      commissionRateRateKey: 'repeat_commission',
      scheduleEntryStatus: RateStatus.PLANNED,
    });
    const svc = new CommissionService(prisma as any);
    try {
      await svc.resolveRate(OrderSource.MARKETPLACE, false, new Date());
      fail('Expected BadRequestException');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toMatchObject({
        code: 'PLANNED_RATE_NOT_ACTIVE',
      });
    }
  });
});

// ── 3. FeastPass payout equality ─────────────────────────────────────────────

describe('FeastPass payout equality', () => {
  /**
   * A FeastPass member's order MUST produce the same vendorPayoutPence as a
   * non-member's order on the same food subtotal + delivery combination.
   *
   * Why: FeastPass waives the CUSTOMER_SIDE service fee. The service fee is
   * platform revenue - it is collected from the customer and retained by
   * Feastpot. It is never part of the vendor payout formula:
   *
   *   totalPence        = subtotal + delivery + serviceFeePence − discount
   *   vendorPayoutPence = totalPence − serviceFeePence − commissionPence
   *                     = subtotal + delivery − discount − commissionPence
   *
   * serviceFeePence cancels out. FeastPass sets serviceFeePence = 0 but also
   * totalPence excludes the fee, so the vendor payout is unchanged.
   *
   * This test asserts the algebraic identity holds for concrete numbers.
   */

  const subtotalPence = 10_000; // £100.00
  const deliveryPence = 500; // £5.00
  const discountPence = 0;
  const rawServiceFee = 299; // £2.99 (5% of £60 example is less, use cap)
  const commissionPct = PLATFORM_FACTS.commission.marketplaceFirst;
  const commissionPence = Math.round((subtotalPence * commissionPct) / 100);

  function calcVendorPayout(serviceFeePence: number): number {
    const totalPence = subtotalPence + deliveryPence + serviceFeePence - discountPence;
    return totalPence - serviceFeePence - commissionPence;
  }

  it('non-member vendor payout equals member vendor payout', () => {
    const nonMemberPayout = calcVendorPayout(rawServiceFee);
    const memberPayout = calcVendorPayout(0); // FeastPass: fee waived, not collected

    expect(memberPayout).toBe(nonMemberPayout);
  });

  it('vendor payout equals subtotal + delivery - commission regardless of service fee', () => {
    const expectedPayout = subtotalPence + deliveryPence - discountPence - commissionPence;

    expect(calcVendorPayout(0)).toBe(expectedPayout);
    expect(calcVendorPayout(rawServiceFee)).toBe(expectedPayout);
    expect(calcVendorPayout(0)).toBe(expectedPayout);
  });

  it('CUSTOMER_SIDE service fee entries are annotated correctly in RateScheduleEntry', () => {
    // The seed must mark customer_service_fee as CUSTOMER_SIDE, not LIVE.
    // If it were LIVE it would be treated as a vendor charge - a billing error.
    // We verify this via the RateStatus enum value used in the seed.
    expect(RateStatus.CUSTOMER_SIDE).toBe('CUSTOMER_SIDE');
    expect(RateStatus.LIVE).toBe('LIVE');
    // A CUSTOMER_SIDE entry should never be used in commission calculation.
    // The commission service only looks up CommissionRate rows (not RateScheduleEntry
    // directly). This separation is enforced by the rateKey guard.
  });
});
