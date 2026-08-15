'use client';

import { useMemo, useState } from 'react';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@feastpot/ui';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  Search,
  ShieldCheck,
  ShieldOff,
  ShieldQuestion,
} from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/ui/stat-card';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { useExpiringDocs, type ExpiringDocRow } from '@/hooks/use-expiring-docs';
import {
  useVerificationSummary,
  type VerificationOverallState,
  type VerificationSummaryRow,
} from '@/hooks/use-vendor-verification';
import { formatDate } from '@/lib/format';

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  hygiene_cert: 'Hygiene cert',
  insurance: 'Insurance',
  photo_id: 'Photo ID',
  bank_details: 'Bank details',
  kitchen_reg: 'Kitchen reg.',
};

/**
 * States considered "needing action" for the default filter view.
 * Suspended is highest severity; VERIFIED is intentionally excluded.
 */
const NEEDS_ACTION_STATES: VerificationOverallState[] = ['NOT_SET_UP', 'RENEWAL_DUE', 'SUSPENDED'];

// ── Filter types ──────────────────────────────────────────────────────────────

type FilterKey = 'NEEDS_ACTION' | 'ALL' | VerificationOverallState;

interface FilterOption {
  key: FilterKey;
  label: string;
  count: (
    counts: { notSetUp: number; VERIFIED: number; RENEWAL_DUE: number; SUSPENDED: number },
    total: number,
  ) => number;
  match: (state: VerificationOverallState) => boolean;
}

const FILTERS: FilterOption[] = [
  {
    key: 'NEEDS_ACTION',
    label: 'Needs action',
    count: (c) => c.notSetUp + c.RENEWAL_DUE + c.SUSPENDED,
    match: (s) => NEEDS_ACTION_STATES.includes(s),
  },
  {
    key: 'NOT_SET_UP',
    label: 'Not set up',
    count: (c) => c.notSetUp,
    match: (s) => s === 'NOT_SET_UP',
  },
  {
    key: 'RENEWAL_DUE',
    label: 'Renewal due',
    count: (c) => c.RENEWAL_DUE,
    match: (s) => s === 'RENEWAL_DUE',
  },
  {
    key: 'SUSPENDED',
    label: 'Suspended',
    count: (c) => c.SUSPENDED,
    match: (s) => s === 'SUSPENDED',
  },
  {
    key: 'VERIFIED',
    label: 'Verified',
    count: (c) => c.VERIFIED,
    match: (s) => s === 'VERIFIED',
  },
  {
    key: 'ALL',
    label: 'All',
    count: (_, total) => total,
    match: () => true,
  },
];

// ── State display helpers ─────────────────────────────────────────────────────

function stateTone(state: VerificationOverallState): StatusTone {
  switch (state) {
    case 'SUSPENDED':
      return 'danger';
    case 'RENEWAL_DUE':
      return 'warning';
    case 'NOT_SET_UP':
      return 'warning';
    case 'VERIFIED':
      return 'success';
  }
}

function stateLabel(state: VerificationOverallState): string {
  switch (state) {
    case 'SUSPENDED':
      return 'Suspended';
    case 'RENEWAL_DUE':
      return 'Renewal due';
    case 'NOT_SET_UP':
      return 'Not set up';
    case 'VERIFIED':
      return 'Verified';
  }
}

function actionLabel(state: VerificationOverallState): string {
  return state === 'NOT_SET_UP' ? 'Set up' : 'Open';
}

/** Sort order for rows: severity descending, then alphabetical. */
const STATE_SORT_ORDER: Record<VerificationOverallState, number> = {
  SUSPENDED: 0,
  RENEWAL_DUE: 1,
  NOT_SET_UP: 2,
  VERIFIED: 3,
};

function urgencyTone(u: ExpiringDocRow['urgency']): StatusTone {
  switch (u) {
    case 'expired':
      return 'danger';
    case 'critical':
    case 'warning':
      return 'warning';
    default:
      return 'success';
  }
}

// ── Verification triage section ───────────────────────────────────────────────

function VerificationTriage() {
  const { data: vs, isLoading, error } = useVerificationSummary();
  const [activeFilter, setActiveFilter] = useState<FilterKey>('NEEDS_ACTION');
  const [search, setSearch] = useState('');

  const filter = FILTERS.find((f) => f.key === activeFilter) ?? FILTERS[0]!;

  const filteredRows = useMemo<VerificationSummaryRow[]>(() => {
    if (!vs) return [];
    const q = search.trim().toLowerCase();
    return vs.rows
      .filter(
        (r) =>
          filter.match(r.overallState) &&
          (q.length === 0 ||
            r.vendorName.toLowerCase().includes(q) ||
            r.vendorId.toLowerCase().includes(q)),
      )
      .sort(
        (a, b) =>
          STATE_SORT_ORDER[a.overallState] - STATE_SORT_ORDER[b.overallState] ||
          a.vendorName.localeCompare(b.vendorName),
      );
  }, [vs, filter, search]);

  return (
    <>
      <h2 className="mb-3 text-base font-semibold tracking-tight">Verification status</h2>

      {error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Failed to load verification summary: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      {/* ── Filter pills ── */}
      <div className="mb-1 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count = vs ? f.count(vs.counts, vs.totalVendors) : null;
          const isActive = activeFilter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setActiveFilter(f.key)}
              className={
                isActive
                  ? 'inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground'
                  : 'inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-surface'
              }
            >
              {f.label}
              {count !== null && (
                <span
                  className={
                    isActive
                      ? 'rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold'
                      : 'rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold'
                  }
                >
                  {isLoading ? '...' : count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/*
       * Reconciliation line: the parts must sum to the whole.
       * Renders the equation on screen so admins can confirm counts
       * reconcile to the total live-vendor population at a glance.
       * An entry missing from this sum would be immediately visible.
       */}
      {vs && (
        <p className="mb-4 text-[11px] text-muted-foreground">
          Not set up <span className="font-semibold text-foreground">{vs.counts.notSetUp}</span>
          {' + '}Verified{' '}
          <span className="font-semibold text-foreground">{vs.counts.VERIFIED}</span>
          {' + '}Renewal due{' '}
          <span className="font-semibold text-foreground">{vs.counts.RENEWAL_DUE}</span>
          {' + '}Suspended{' '}
          <span className="font-semibold text-foreground">{vs.counts.SUSPENDED}</span>
          {' = '}
          <span className="font-semibold text-foreground">{vs.totalVendors}</span>
          {' live vendors total'}
        </p>
      )}

      {/* ── Search ── */}
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder="Search by name or vendor ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-border bg-white py-1.5 pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* ── Unified vendor table ── */}
      <Card className="mb-6">
        <CardContent className="p-0">
          {isLoading && (
            <div className="py-6 text-center text-sm text-muted-foreground">Loading...</div>
          )}
          {!isLoading && filteredRows.length === 0 && !error && (
            <EmptyState
              icon={ShieldCheck}
              title={
                search.length > 0
                  ? 'No vendors match your search'
                  : activeFilter === 'NEEDS_ACTION'
                    ? 'All live vendors are verified'
                    : 'No vendors in this state'
              }
              description={
                search.length > 0
                  ? 'Try a different name or vendor ID.'
                  : activeFilter === 'NEEDS_ACTION'
                    ? 'No verification issues found.'
                    : ''
              }
              bordered={false}
            />
          )}
          {!isLoading && filteredRows.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Insurance expires</TableHead>
                  <TableHead>Training expires</TableHead>
                  <TableHead>Last notified</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => (
                  <TableRow key={row.vendorId}>
                    <TableCell>
                      <p className="font-medium">{row.vendorName}</p>
                      <p className="text-[11px] text-muted-foreground">{row.vendorId}</p>
                    </TableCell>
                    <TableCell>
                      <StatusPill tone={stateTone(row.overallState)}>
                        {stateLabel(row.overallState)}
                      </StatusPill>
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.insuranceValidUntil ? (
                        <StatusPill
                          tone={
                            row.overallState === 'SUSPENDED' || row.overallState === 'RENEWAL_DUE'
                              ? 'warning'
                              : 'neutral'
                          }
                        >
                          {formatDate(row.insuranceValidUntil)}
                        </StatusPill>
                      ) : (
                        <span className="text-muted-foreground">--</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.allergenTrainingUntil ? (
                        <StatusPill
                          tone={
                            row.overallState === 'SUSPENDED' || row.overallState === 'RENEWAL_DUE'
                              ? 'warning'
                              : 'neutral'
                          }
                        >
                          {formatDate(row.allergenTrainingUntil)}
                        </StatusPill>
                      ) : (
                        <span className="text-muted-foreground">--</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.lastNotifiedAt ? (
                        <span title={`State: ${row.lastNotifiedState ?? 'unknown'}`}>
                          {formatDate(row.lastNotifiedAt)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/vendors/${row.vendorId}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {actionLabel(row.overallState)}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ── Expiring documents section (unchanged) ────────────────────────────────────

function ExpiringDocumentsSection() {
  const { data, isLoading, error } = useExpiringDocs();

  const stats = useMemo(() => {
    const rows = data ?? [];
    return {
      total: rows.length,
      expired: rows.filter((r) => r.urgency === 'expired').length,
      critical: rows.filter((r) => r.urgency === 'critical').length,
      warning: rows.filter((r) => r.urgency === 'warning').length,
    };
  }, [data]);

  return (
    <>
      <h2 className="mb-3 text-base font-semibold tracking-tight">Expiring documents</h2>

      {error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Failed to load expiring documents: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={ShieldCheck}
          tone="teal"
          label="Tracked documents"
          value={isLoading ? '...' : stats.total.toString()}
          caption="Expiring within 30 days or already expired"
        />
        <StatCard
          icon={CheckCircle2}
          tone="teal"
          label="Approved"
          value={
            isLoading
              ? '...'
              : Math.max(0, stats.total - stats.expired - stats.critical - stats.warning).toString()
          }
          caption="Healthy and not expiring soon"
        />
        <StatCard
          icon={AlertTriangle}
          tone="amber"
          label="Expiring soon"
          value={isLoading ? '...' : (stats.critical + stats.warning).toString()}
          caption="Within 30 days"
        />
        <StatCard
          icon={AlertOctagon}
          tone="red"
          label="Expired"
          value={isLoading ? '...' : stats.expired.toString()}
          caption="Action required"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Days remaining</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      icon={FileCheck2}
                      title="All documents are healthy"
                      description="No vendor documents are expiring within the next 30 days."
                      bordered={false}
                    />
                  </TableCell>
                </TableRow>
              )}
              {(data ?? []).map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.vendorName}</TableCell>
                  <TableCell className="text-sm">{TYPE_LABELS[d.type] ?? d.type}</TableCell>
                  <TableCell>
                    <StatusPill tone={urgencyTone(d.urgency)}>{d.status}</StatusPill>
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(d.expiresAt)}</TableCell>
                  <TableCell className="text-right text-sm">
                    {d.daysRemaining === null
                      ? '-'
                      : d.daysRemaining < 0
                        ? `Expired ${Math.abs(d.daysRemaining)}d ago`
                        : `${d.daysRemaining}d`}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/vendors/${d.vendorId}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Open
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────

export function ComplianceClient() {
  return (
    <>
      <PageHeader
        title="Compliance"
        description="Monitor vendor verification status, documents and expiry dates."
      />
      <VerificationTriage />
      <ExpiringDocumentsSection />
    </>
  );
}
