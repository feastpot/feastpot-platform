/**
 * VendorVerificationService.getVerificationSummary() -- unit tests
 *
 * Covers:
 *   - The invariant: sum of all state counts always equals totalVendors.
 *     This is the regression test for the original bug where VERIFIED vendors
 *     were silently dropped from the response, making counts irreconcilable.
 *
 *   - Every state transition the system permits: for each (from, to) pair the
 *     from-state count decrements by 1, the to-state count increments by 1,
 *     and totalVendors is unchanged.
 *
 *   - Rows: every vendor appears exactly once regardless of state.
 *     NOT_SET_UP is returned for vendors with no VendorVerification record.
 *
 * Does NOT test state-change mechanics (upsertVerification, runVerificationScan,
 * enforcement) -- those have their own specs.
 */

import { VerificationState } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { VendorEnforcementService } from '../vendor-enforcement/vendor-enforcement.service';

import { VendorVerificationService } from './vendor-verification.service';

// ── Types ────────────────────────────────────────────────────────────────────

type _OverallState = 'NOT_SET_UP' | VerificationState;

// ── Mock builders ─────────────────────────────────────────────────────────────

const V_STATE = VerificationState;

function vendor(id: string, businessName = `Vendor ${id}`) {
  return { id, businessName };
}

function verif(
  vendorId: string,
  overallState: VerificationState,
): {
  vendorId: string;
  overallState: VerificationState;
  insuranceValidUntil: null;
  allergenTrainingUntil: null;
  lastNotifiedState: null;
  lastNotifiedAt: null;
} {
  return {
    vendorId,
    overallState,
    insuranceValidUntil: null,
    allergenTrainingUntil: null,
    lastNotifiedState: null,
    lastNotifiedAt: null,
  };
}

function makePrisma(
  vendors: { id: string; businessName: string }[],
  verifications: ReturnType<typeof verif>[],
) {
  return {
    vendor: {
      findMany: jest.fn().mockResolvedValue(vendors),
      findUnique: jest.fn(),
    },
    vendorVerification: {
      findMany: jest.fn().mockResolvedValue(verifications),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    order: { count: jest.fn().mockResolvedValue(0) },
  } as unknown as jest.Mocked<any>;
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  const notifications = { enqueue: jest.fn() } as unknown as NotificationsService;
  const enforcement = { createAutomatedSuspension: jest.fn() } as unknown as VendorEnforcementService;
  return new VendorVerificationService(prisma, notifications, enforcement);
}

// ── Helper: call getVerificationSummary with specific state ───────────────────

async function summarise(
  vendorList: { id: string; businessName: string }[],
  verifList: ReturnType<typeof verif>[],
) {
  const prisma = makePrisma(vendorList, verifList);
  return makeService(prisma).getVerificationSummary();
}

// ── 1. Sum invariant ─────────────────────────────────────────────────────────

describe('getVerificationSummary -- sum invariant', () => {
  it('sum of all state counts equals totalVendors when all states are present', async () => {
    const vendors = [vendor('a'), vendor('b'), vendor('c'), vendor('d'), vendor('e')];
    const verifs = [
      verif('a', V_STATE.VERIFIED),
      verif('b', V_STATE.RENEWAL_DUE),
      verif('c', V_STATE.SUSPENDED),
      // 'd' has no record => NOT_SET_UP
      // 'e' has no record => NOT_SET_UP
    ];
    const result = await summarise(vendors, verifs);

    const { counts, totalVendors } = result;
    const sum = counts.notSetUp + counts.VERIFIED + counts.RENEWAL_DUE + counts.SUSPENDED;

    expect(sum).toBe(totalVendors);
    expect(totalVendors).toBe(5);
    expect(counts.VERIFIED).toBe(1);
    expect(counts.RENEWAL_DUE).toBe(1);
    expect(counts.SUSPENDED).toBe(1);
    expect(counts.notSetUp).toBe(2);
  });

  it('sum invariant holds with zero vendors', async () => {
    const result = await summarise([], []);
    const { counts, totalVendors } = result;
    expect(counts.notSetUp + counts.VERIFIED + counts.RENEWAL_DUE + counts.SUSPENDED).toBe(totalVendors);
    expect(totalVendors).toBe(0);
  });

  it('sum invariant holds with only VERIFIED vendors (regression: VERIFIED was previously dropped)', async () => {
    const vendors = [vendor('a'), vendor('b'), vendor('c')];
    const verifs = vendors.map((v) => verif(v.id, V_STATE.VERIFIED));
    const result = await summarise(vendors, verifs);

    const { counts, totalVendors } = result;
    expect(counts.notSetUp + counts.VERIFIED + counts.RENEWAL_DUE + counts.SUSPENDED).toBe(totalVendors);
    expect(counts.VERIFIED).toBe(3);
    expect(totalVendors).toBe(3);
  });

  it('VERIFIED vendors appear in the rows list (regression: they were previously absent)', async () => {
    const vendors = [vendor('v1'), vendor('v2')];
    const verifs = [verif('v1', V_STATE.VERIFIED), verif('v2', V_STATE.RENEWAL_DUE)];
    const result = await summarise(vendors, verifs);

    const vendorIds = result.rows.map((r) => r.vendorId);
    expect(vendorIds).toContain('v1');
    expect(vendorIds).toContain('v2');
    expect(result.rows).toHaveLength(2);
  });
});

// ── 2. State transitions ──────────────────────────────────────────────────────

/**
 * For each permitted (from, to) pair, verify that after a transition:
 *   - the from-state count decrements by 1
 *   - the to-state count increments by 1
 *   - totalVendors is unchanged
 *
 * "NOT_SET_UP" means no VendorVerification record exists for that vendor.
 *
 * We simulate "before" and "after" by calling getVerificationSummary twice
 * with different mock data.  We do not test the actual state-change methods
 * here (those belong in their own specs).
 */

type StateKey = 'NOT_SET_UP' | 'VERIFIED' | 'RENEWAL_DUE' | 'SUSPENDED';

// All transitions the system permits.  SUSPENDED->RENEWAL_DUE and
// RENEWAL_DUE->SUSPENDED are valid admin-upsert paths; all others are
// exercised by the scan, enforcement lift, or admin upsert flows.
const PERMITTED_TRANSITIONS: [StateKey, StateKey][] = [
  ['NOT_SET_UP', 'VERIFIED'],
  ['NOT_SET_UP', 'RENEWAL_DUE'],
  ['NOT_SET_UP', 'SUSPENDED'],
  ['VERIFIED', 'RENEWAL_DUE'],
  ['VERIFIED', 'SUSPENDED'],
  ['RENEWAL_DUE', 'VERIFIED'],
  ['RENEWAL_DUE', 'SUSPENDED'],
  ['SUSPENDED', 'VERIFIED'],
  ['SUSPENDED', 'RENEWAL_DUE'],
];

/** Build a vendors+verifications pair that puts the transition target vendor into `state`. */
function buildStateFixture(
  transitionVendorId: string,
  state: StateKey,
  bystanders: { id: string; businessName: string }[],
  bystanderState: VerificationState,
) {
  const allVendors = [vendor(transitionVendorId, 'Transition Vendor'), ...bystanders];
  const allVerifs: ReturnType<typeof verif>[] = bystanders.map((b) =>
    verif(b.id, bystanderState),
  );
  if (state !== 'NOT_SET_UP') {
    allVerifs.push(verif(transitionVendorId, V_STATE[state]));
  }
  // when state === 'NOT_SET_UP', no record is added for the transition vendor
  return { vendors: allVendors, verifs: allVerifs };
}

function countKey(state: StateKey): 'notSetUp' | 'VERIFIED' | 'RENEWAL_DUE' | 'SUSPENDED' {
  return state === 'NOT_SET_UP' ? 'notSetUp' : state;
}

describe.each(PERMITTED_TRANSITIONS)(
  'getVerificationSummary -- state transition %s -> %s',
  (fromState, toState) => {
    const TRANSITION_VENDOR = 'txn-vendor-001';
    const BYSTANDERS = [vendor('by-1', 'Bystander 1'), vendor('by-2', 'Bystander 2')];
    const BYSTANDER_STATE = V_STATE.VERIFIED;

    it(`${fromState} -> ${toState}: from-count decrements, to-count increments, total unchanged`, async () => {
      const { vendors: vBefore, verifs: vrBefore } = buildStateFixture(
        TRANSITION_VENDOR,
        fromState,
        BYSTANDERS,
        BYSTANDER_STATE,
      );
      const { vendors: vAfter, verifs: vrAfter } = buildStateFixture(
        TRANSITION_VENDOR,
        toState,
        BYSTANDERS,
        BYSTANDER_STATE,
      );

      const before = await summarise(vBefore, vrBefore);
      const after = await summarise(vAfter, vrAfter);

      const fromKey = countKey(fromState);
      const toKey = countKey(toState);

      expect(after.totalVendors).toBe(before.totalVendors); // total unchanged
      expect(after.counts[fromKey]).toBe(before.counts[fromKey] - 1); // from decrements
      expect(after.counts[toKey]).toBe(before.counts[toKey] + 1);   // to increments

      // Bystander counts must not change.
      const allKeys: (keyof typeof before.counts)[] = [
        'notSetUp', 'VERIFIED', 'RENEWAL_DUE', 'SUSPENDED',
      ];
      for (const k of allKeys) {
        if (k !== fromKey && k !== toKey) {
          expect(after.counts[k]).toBe(before.counts[k]);
        }
      }
    });

    it(`${fromState} -> ${toState}: sum invariant holds in both before and after states`, async () => {
      for (const state of [fromState, toState]) {
        const { vendors, verifs } = buildStateFixture(
          TRANSITION_VENDOR,
          state,
          BYSTANDERS,
          BYSTANDER_STATE,
        );
        const result = await summarise(vendors, verifs);
        const sum =
          result.counts.notSetUp +
          result.counts.VERIFIED +
          result.counts.RENEWAL_DUE +
          result.counts.SUSPENDED;
        expect(sum).toBe(result.totalVendors);
      }
    });
  },
);

// ── 3. Row coverage ───────────────────────────────────────────────────────────

describe('getVerificationSummary -- row coverage', () => {
  it('every vendor appears exactly once in rows regardless of their state', async () => {
    const vendors = [vendor('a'), vendor('b'), vendor('c'), vendor('d')];
    const verifs = [
      verif('a', V_STATE.VERIFIED),
      verif('b', V_STATE.RENEWAL_DUE),
      verif('c', V_STATE.SUSPENDED),
      // 'd' has no record
    ];
    const result = await summarise(vendors, verifs);

    expect(result.rows).toHaveLength(4);
    const ids = result.rows.map((r) => r.vendorId).sort();
    expect(ids).toEqual(['a', 'b', 'c', 'd']);
  });

  it('vendors with no VendorVerification record have overallState NOT_SET_UP', async () => {
    const vendors = [vendor('no-record')];
    const result = await summarise(vendors, []);

    expect(result.rows[0]?.overallState).toBe('NOT_SET_UP');
  });

  it('rows include lastNotifiedState and lastNotifiedAt from the verification record', async () => {
    const notifiedAt = new Date('2026-08-14T10:00:00Z');
    const prisma = makePrisma(
      [vendor('v1')],
      [
        {
          vendorId: 'v1',
          overallState: V_STATE.SUSPENDED,
          insuranceValidUntil: null,
          allergenTrainingUntil: null,
          lastNotifiedState: V_STATE.SUSPENDED,
          lastNotifiedAt: notifiedAt,
        },
      ],
    );
    const result = await makeService(prisma).getVerificationSummary();

    expect(result.rows[0]?.lastNotifiedState).toBe(V_STATE.SUSPENDED);
    expect(result.rows[0]?.lastNotifiedAt).toEqual(notifiedAt);
  });
});
