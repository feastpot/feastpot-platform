import { TestDataFactory } from './index';

/**
 * Repair an empty currently effective test schedule, never create a newer
 * global version or reactivate an old one. Preserve populated snapshots.
 */
export async function prepareRateScheduleBaseline(factory: TestDataFactory): Promise<void> {
  if (process.env.NODE_ENV !== 'test') throw new Error('TEST_RATE_BASELINE_FORBIDDEN');
  await factory.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('test-factory:rate-schedule-baseline'))`;
    const now = new Date();
    const current = await tx.termsVersion.findFirstOrThrow({
      where: { documentType: 'RATE_SCHEDULE', effectiveAt: { lte: now } },
      orderBy: [{ effectiveAt: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }],
      include: { rateScheduleEntries: true },
    });
    if (current.rateScheduleEntries.length) return;
    const source = await tx.termsVersion.findFirstOrThrow({
      where: {
        documentType: 'RATE_SCHEDULE',
        effectiveAt: { lte: now },
        rateScheduleEntries: { some: {} },
      },
      orderBy: [{ effectiveAt: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }],
      include: { rateScheduleEntries: true },
    });
    const rates = await tx.commissionRate.findMany({
      where: {
        isAnomalous: false,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    const active = new Map<string, (typeof rates)[number]['ratePercent']>();
    for (const rate of rates) {
      const key =
        rate.rateKey ??
        (rate.source === 'VENDOR_REFERRED'
          ? 'referred_commission'
          : rate.isFirstOrder === true
            ? 'standard_commission'
            : rate.isFirstOrder === false
              ? 'repeat_commission'
              : null);
      if (key && !active.has(key)) active.set(key, rate.ratePercent);
    }
    await tx.rateScheduleEntry.createMany({
      data: source.rateScheduleEntries.map(({ id: _id, versionId: _versionId, ...entry }) => ({
        ...entry,
        versionId: current.id,
        rateValue: active.get(entry.key) ?? entry.rateValue,
        rateDisplay: active.has(entry.key) ? `${active.get(entry.key)}%` : entry.rateDisplay,
      })),
    });
  });
}
