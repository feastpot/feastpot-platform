import { Logger } from '@nestjs/common';
import { CapacityType, Prisma, PrismaClient, TrustSignalStatus } from '@prisma/client';

/**
 * Server-side data helpers for vendor trust signals and per-date capacity.
 * Data layer only: NO UI imports, NOT wired into checkout or the order state
 * machine yet - a later task consumes these.
 *
 * Written as pure functions over a Prisma client (rather than a Nest
 * provider) so no existing module file needs editing; callers pass the
 * globally-provided PrismaService.
 */

const logger = new Logger('VendorCapacity');

/** Any Prisma client-ish handle, including a transaction client. */
type Db = PrismaClient | Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Typed errors (T5)
// ---------------------------------------------------------------------------

/** Reservation would push slots_taken above total_slots. */
export class CapacityExceededError extends Error {
  readonly code = 'CAPACITY_EXCEEDED' as const;
  constructor(
    readonly remainingSlots: number,
    readonly requested: number,
  ) {
    super(`Capacity exceeded: requested ${requested}, remaining ${remainingSlots}`);
    this.name = 'CapacityExceededError';
  }
}

/** now() is after the row's preorder_cutoff_at. */
export class PreorderCutoffPassedError extends Error {
  readonly code = 'PREORDER_CUTOFF_PASSED' as const;
  constructor(readonly preorderCutoffAt: Date) {
    super(`Pre-order cutoff passed at ${preorderCutoffAt.toISOString()}`);
    this.name = 'PreorderCutoffPassedError';
  }
}

/** No capacity row exists for (vendor, date, type). */
export class CapacityNotConfiguredError extends Error {
  readonly code = 'CAPACITY_NOT_CONFIGURED' as const;
  constructor() {
    super('No capacity row configured for this vendor/date/type');
    this.name = 'CapacityNotConfiguredError';
  }
}

// ---------------------------------------------------------------------------
// Feature flag (T6)
// ---------------------------------------------------------------------------

/**
 * CAPACITY_ENFORCEMENT feature flag, default false. Read at call time (repo
 * convention: env var compared to 'true') so it can be flipped without a
 * code change. When false, reserveCapacity logs what WOULD have happened and
 * never blocks.
 */
export function isCapacityEnforcementEnabled(): boolean {
  return process.env.CAPACITY_ENFORCEMENT === 'true';
}

// ---------------------------------------------------------------------------
// Reads (T4)
// ---------------------------------------------------------------------------

/**
 * Trust signals for a vendor. By default (includeUnverified=false) only
 * `verified` signals are returned - the customer-facing surface must never
 * see unverified claims.
 */
export async function getVendorTrustSignals(db: Db, vendorId: string, includeUnverified = false) {
  return db.vendorTrustSignal.findMany({
    where: {
      vendorId,
      ...(includeUnverified ? {} : { status: TrustSignalStatus.verified }),
    },
    orderBy: { signalType: 'asc' },
  });
}

export interface CapacityDay {
  serviceDate: string; // YYYY-MM-DD
  capacityType: CapacityType;
  totalSlots: number;
  slotsTaken: number;
  remainingSlots: number;
  preorderCutoffAt: string | null; // ISO timestamp
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Per-capacity_type, per-date availability for the next `days` days
 * (default 21) starting at `fromDate` (default today, UTC). Only dates with
 * a configured capacity row are returned; remainingSlots is derived from the
 * stored columns.
 */
export async function getVendorAvailability(
  db: Db,
  vendorId: string,
  fromDate?: Date,
  days = 21,
): Promise<CapacityDay[]> {
  const start = fromDate ?? new Date();
  const startDay = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
  );
  const end = new Date(startDay.getTime() + days * 24 * 60 * 60 * 1000);

  const rows = await db.vendorCapacity.findMany({
    where: { vendorId, serviceDate: { gte: startDay, lt: end } },
    orderBy: [{ serviceDate: 'asc' }, { capacityType: 'asc' }],
  });
  return rows.map((r) => ({
    serviceDate: toIsoDate(r.serviceDate),
    capacityType: r.capacityType,
    totalSlots: r.totalSlots,
    slotsTaken: r.slotsTaken,
    remainingSlots: r.totalSlots - r.slotsTaken,
    preorderCutoffAt: r.preorderCutoffAt ? r.preorderCutoffAt.toISOString() : null,
  }));
}

// ---------------------------------------------------------------------------
// Reserve / release (T5)
// ---------------------------------------------------------------------------

export interface ReserveResult {
  /** True when the reservation was recorded (or enforcement is off). */
  ok: true;
  /** Remaining slots after this call; null when enforcement is off and no row exists. */
  remainingSlots: number | null;
  /** False when enforcement is disabled and the call was log-only. */
  enforced: boolean;
}

interface LockedCapacityRow {
  id: string;
  total_slots: number;
  slots_taken: number;
  preorder_cutoff_at: Date | null;
}

/**
 * Atomically reserve `quantity` slots for (vendor, serviceDate, capacityType).
 *
 * Runs in one transaction; the capacity row is locked with
 * SELECT ... FOR UPDATE so two concurrent reservations serialize and the
 * second sees the first's increment. Throws:
 *   - PreorderCutoffPassedError when now() > preorder_cutoff_at
 *   - CapacityExceededError when quantity would exceed total_slots
 *   - CapacityNotConfiguredError when no row exists (enforcement on only)
 *
 * With CAPACITY_ENFORCEMENT unset/false the outcome is computed and logged
 * but the call always succeeds without writing.
 */
export async function reserveCapacity(
  prisma: PrismaClient,
  vendorId: string,
  serviceDate: Date,
  capacityType: CapacityType,
  quantity: number,
): Promise<ReserveResult> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('quantity must be a positive integer');
  }
  const enforce = isCapacityEnforcementEnabled();

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<LockedCapacityRow[]>`
      SELECT "id", "total_slots", "slots_taken", "preorder_cutoff_at"
      FROM "vendor_capacity"
      WHERE "vendor_id" = ${vendorId}::uuid
        AND "service_date" = ${toIsoDate(serviceDate)}::date
        AND "capacity_type" = ${capacityType}::"vendor_capacity_type"
      FOR UPDATE
    `;
    const row = rows[0];

    if (!row) {
      if (!enforce) {
        logger.log(
          `[capacity dry-run] no capacity row for vendor=${vendorId} date=${toIsoDate(serviceDate)} type=${capacityType}; allowing (CAPACITY_ENFORCEMENT off)`,
        );
        return { ok: true as const, remainingSlots: null, enforced: false };
      }
      throw new CapacityNotConfiguredError();
    }

    const cutoffPassed = row.preorder_cutoff_at !== null && new Date() > row.preorder_cutoff_at;
    const wouldExceed = row.slots_taken + quantity > row.total_slots;

    if (!enforce) {
      logger.log(
        `[capacity dry-run] vendor=${vendorId} date=${toIsoDate(serviceDate)} type=${capacityType} qty=${quantity} → ${
          cutoffPassed
            ? 'WOULD BLOCK (cutoff passed)'
            : wouldExceed
              ? 'WOULD BLOCK (full)'
              : 'would allow'
        } (slots ${row.slots_taken}/${row.total_slots}); allowing (CAPACITY_ENFORCEMENT off)`,
      );
      return {
        ok: true as const,
        remainingSlots: row.total_slots - row.slots_taken,
        enforced: false,
      };
    }

    if (cutoffPassed) throw new PreorderCutoffPassedError(row.preorder_cutoff_at!);
    if (wouldExceed) throw new CapacityExceededError(row.total_slots - row.slots_taken, quantity);

    const updated = await tx.vendorCapacity.update({
      where: { id: row.id },
      data: { slotsTaken: { increment: quantity } },
      select: { totalSlots: true, slotsTaken: true },
    });
    return {
      ok: true as const,
      remainingSlots: updated.totalSlots - updated.slotsTaken,
      enforced: true,
    };
  });
}

/**
 * Release previously reserved slots (order cancellation / vendor rejection -
 * wired up by a later task). Decrements slots_taken, clamped at zero, inside
 * the same row lock so concurrent releases can't underflow.
 */
export async function releaseCapacity(
  prisma: PrismaClient,
  vendorId: string,
  serviceDate: Date,
  capacityType: CapacityType,
  quantity: number,
): Promise<{ remainingSlots: number | null }> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('quantity must be a positive integer');
  }
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<LockedCapacityRow[]>`
      SELECT "id", "total_slots", "slots_taken", "preorder_cutoff_at"
      FROM "vendor_capacity"
      WHERE "vendor_id" = ${vendorId}::uuid
        AND "service_date" = ${toIsoDate(serviceDate)}::date
        AND "capacity_type" = ${capacityType}::"vendor_capacity_type"
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) return { remainingSlots: null };

    const next = Math.max(0, row.slots_taken - quantity);
    const updated = await tx.vendorCapacity.update({
      where: { id: row.id },
      data: { slotsTaken: next },
      select: { totalSlots: true, slotsTaken: true },
    });
    return { remainingSlots: updated.totalSlots - updated.slotsTaken };
  });
}
