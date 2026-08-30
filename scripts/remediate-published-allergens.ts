import { Prisma, PrismaClient } from '@prisma/client';

const EVENT_NAME = 'vendor_menu_allergen_remediation';

type Candidate = {
  id: string;
  vendorId: string;
  vendor: {
    businessName: string;
    userId: string;
  };
  allergenRemediation: { id: string } | null;
};

function numericFlag(name: string): number | null {
  const prefix = `${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: npm run remediate:published-allergens -- --production [--apply --confirm-count=N]',
    );
    return;
  }
  const production = process.argv.includes('--production');
  const apply = process.argv.includes('--apply');
  const confirmCount = numericFlag('--confirm-count');
  const url = production ? process.env.PROD_DIRECT_URL : process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      production ? 'PROD_DIRECT_URL is not configured' : 'DATABASE_URL is not configured',
    );
  }
  if (apply && !production) {
    throw new Error('Writes are restricted to an explicit --production run');
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const candidates = await prisma.menuItem.findMany({
      where: {
        isAvailable: true,
        allergens: { isEmpty: true },
        allergensFreeFrom: false,
      },
      select: {
        id: true,
        vendorId: true,
        vendor: { select: { businessName: true, userId: true } },
        allergenRemediation: { select: { id: true } },
      },
      orderBy: [{ vendorId: 'asc' }, { id: 'asc' }],
    });

    const grouped = new Map<
      string,
      { vendorName: string; userId: string; itemIds: string[]; newItemIds: string[] }
    >();
    for (const row of candidates as Candidate[]) {
      const group = grouped.get(row.vendorId) ?? {
        vendorName: row.vendor.businessName,
        userId: row.vendor.userId,
        itemIds: [],
        newItemIds: [],
      };
      group.itemIds.push(row.id);
      if (!row.allergenRemediation) group.newItemIds.push(row.id);
      grouped.set(row.vendorId, group);
    }

    console.log(`Affected items: ${candidates.length}`);
    console.log(`Affected vendors: ${grouped.size}`);
    for (const [vendorId, group] of grouped) {
      console.log(`${vendorId}\t${group.vendorName}\t${group.itemIds.length}`);
    }

    if (!apply) {
      console.log('Read-only measurement complete. No rows changed.');
      return;
    }
    if (confirmCount !== candidates.length) {
      throw new Error(
        `Refusing write: --confirm-count=${confirmCount ?? 'missing'} does not match measured count ${candidates.length}`,
      );
    }
    if (candidates.length === 0) {
      console.log('Nothing to remediate. No rows changed.');
      return;
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const created = await tx.menuItemAllergenRemediation.createMany({
        data: (candidates as Candidate[])
          .filter((row) => !row.allergenRemediation)
          .map((row) => ({
            menuItemId: row.id,
            vendorId: row.vendorId,
            priorIsAvailable: true,
            remediatedAt: now,
          })),
        skipDuplicates: true,
      });

      const hidden = await tx.menuItem.updateMany({
        where: {
          id: { in: candidates.map((row) => row.id) },
          isAvailable: true,
          allergens: { isEmpty: true },
          allergensFreeFrom: false,
        },
        data: { isAvailable: false },
      });
      if (hidden.count !== candidates.length) {
        throw new Error(
          `Concurrent change detected: expected to hide ${candidates.length}, hid ${hidden.count}`,
        );
      }

      for (const [vendorId, group] of grouped) {
        if (group.newItemIds.length === 0) continue;
        const jobId = `allergen-remediation:${vendorId}`;
        const existingNotice = await tx.notificationOutbox.findFirst({
          where: { eventName: EVENT_NAME, jobId },
          select: { id: true },
        });
        if (existingNotice) continue;
        await tx.notificationOutbox.create({
          data: {
            eventName: EVENT_NAME,
            jobId,
            payload: {
              userId: group.userId,
              vendorId,
              vendorName: group.vendorName,
              affectedItemCount: group.itemIds.length,
              portalUrl: 'https://vendor.feastpot.co.uk/menu',
            } satisfies Prisma.InputJsonObject,
          },
        });
        await tx.menuItemAllergenRemediation.updateMany({
          where: { vendorId, menuItemId: { in: group.newItemIds } },
          data: { notificationQueuedAt: now },
        });
      }

      console.log(`Recorded ${created.count} recoverable remediation rows.`);
    });

    console.log(`Hidden ${candidates.length} item(s) and queued ${grouped.size} vendor notice(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
