/**
 * Payout reconciliation check (read-only ops diagnostic).
 *
 * For every payout marked `transferred`, confirm it has a real Stripe
 * transfer and that Stripe's recorded amount matches our DB. This never
 * mutates anything — it only reads from the DB and Stripe and exits
 * non-zero if any discrepancy is found, so it is safe to wire into CI / a
 * cron after each weekly payout run.
 *
 * Usage:
 *   npm run verify:payouts
 *   npx ts-node scripts/verify-payout-reconciliation.ts
 *
 * Requires STRIPE_SECRET_KEY and the usual Prisma DB env vars.
 */
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';

const prisma = new PrismaClient();

const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.error('STRIPE_SECRET_KEY is not set — cannot reconcile against Stripe.');
  process.exit(1);
}

// Pin to the same API version the app uses (see apps/api/src/stripe/stripe.service.ts)
// so transfer shapes match what production created.
const stripe = new Stripe(stripeKey, {
  apiVersion: '2024-11-20.acacia' as Stripe.LatestApiVersion,
});

// Page through ALL transferred payouts (id-cursor) so the "every transferred
// payout" claim is real — a fixed cap could skip older rows and still exit 0.
const BATCH = 100;

async function verifyPayoutReconciliation(): Promise<void> {
  console.log('\n════════ PAYOUT RECONCILIATION CHECK ════════');

  let discrepancies = 0;
  let checked = 0;
  let cursor: string | undefined;

  for (;;) {
    const payouts = await prisma.payout.findMany({
      where: { status: 'transferred' },
      include: { vendor: { select: { businessName: true } } },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (payouts.length === 0) break;
    cursor = payouts[payouts.length - 1].id;

    for (const payout of payouts) {
      checked++;
      const name = payout.vendor.businessName;
      if (!payout.stripeTransferId) {
        console.error(`❌ ${name} [${payout.id}]: status=transferred but no stripeTransferId`);
        discrepancies++;
        continue;
      }
      try {
        const transfer = await stripe.transfers.retrieve(payout.stripeTransferId);
        if (transfer.amount !== payout.amountPence) {
          console.error(
            `❌ ${name} [${payout.id}]: DB amount=${payout.amountPence}p ` +
              `Stripe amount=${transfer.amount}p — DISCREPANCY`,
          );
          discrepancies++;
        } else {
          console.log(`✅ ${name}: £${(payout.amountPence / 100).toFixed(2)} confirmed`);
        }
      } catch (e) {
        console.error(`❌ ${name} [${payout.id}]: Stripe lookup failed — ${(e as Error).message}`);
        discrepancies++;
      }
    }

    if (payouts.length < BATCH) break;
  }

  console.log(`\nChecked ${checked} transferred payouts.\n`);

  console.log(
    `\n════════ RESULT: ${
      discrepancies === 0 ? '✅ ZERO DISCREPANCIES' : `❌ ${discrepancies} DISCREPANCIES FOUND`
    } ════════\n`,
  );
  await prisma.$disconnect();
  process.exit(discrepancies > 0 ? 1 : 0);
}

verifyPayoutReconciliation().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
