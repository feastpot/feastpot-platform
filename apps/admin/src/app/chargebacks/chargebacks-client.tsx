'use client';

import {
  Button,
  Card,
  CardContent,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@feastpot/ui';
import { CreditCard, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterCard, FilterField } from '@/components/ui/filter-card';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import {
  useChargebacks,
  useChargebackStats,
  type ChargebackFilters,
  type ChargebackRow,
  type ChargebackStatus,
} from '@/hooks/use-chargebacks';
import { formatDateTime, formatPence } from '@/lib/format';

// -- status enums + label/tone maps ------------------------------------------
//
// Stripe dispute statuses. We badge the documented ones explicitly and fall
// back to a neutral tone for any Stripe adds later (the type keeps `string`).

const STATUS_OPTIONS: ReadonlyArray<{ value: ChargebackStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'needs_response', label: 'Needs response' },
  { value: 'warning_needs_response', label: 'Warning: needs response' },
  { value: 'warning_under_review', label: 'Warning: under review' },
  { value: 'under_review', label: 'Under review' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'charge_refunded', label: 'Charge refunded' },
];

const STATUS_TONE: Record<string, StatusTone> = {
  needs_response: 'danger',
  warning_needs_response: 'warning',
  warning_under_review: 'info',
  under_review: 'info',
  won: 'success',
  lost: 'danger',
  charge_refunded: 'neutral',
};

function statusLabel(status: ChargebackStatus): string {
  const known = STATUS_OPTIONS.find((o) => o.value === status);
  return known ? known.label : status.replace(/_/g, ' ');
}

// -- evidence-deadline helpers -----------------------------------------------

const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;

/** Whether an evidence deadline is within 72h or already past. */
function isEvidenceUrgent(evidenceDueBy: string | null): boolean {
  if (!evidenceDueBy) return false;
  const due = new Date(evidenceDueBy).getTime();
  if (Number.isNaN(due)) return false;
  return due - Date.now() <= SEVENTY_TWO_HOURS_MS;
}

// -- component ---------------------------------------------------------------

export function ChargebacksClient() {
  const [status, setStatus] = useState<ChargebackStatus | 'all'>('all');
  const [orderId, setOrderId] = useState('');
  const [pageSize, setPageSize] = useState(20);

  // Pagination via cursor stack: each entry is the cursor that produced
  // page N. Page 0 has cursor `undefined`. "Next" pushes; "Prev" pops.
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined]);
  const cursor = cursorStack[cursorStack.length - 1];
  const pageIndex = cursorStack.length - 1;

  const filters: ChargebackFilters = useMemo(
    () => ({
      status: status === 'all' ? undefined : status,
      orderId: orderId.trim() || undefined,
      cursor,
      limit: pageSize,
    }),
    [status, orderId, cursor, pageSize],
  );

  const { data, isLoading, error } = useChargebacks(filters);
  const { data: stats } = useChargebackStats();

  const rows = data?.data ?? [];
  const hasNext = Boolean(data?.nextCursor);
  const hasPrev = pageIndex > 0;

  function resetPaging() {
    setCursorStack([undefined]);
  }
  function clearFilters() {
    setStatus('all');
    setOrderId('');
    resetPaging();
  }

  return (
    <>
      <PageHeader
        title="Chargebacks"
        description="Stripe disputes raised against FeastPot payments: track evidence deadlines and reconciliation."
      />

      <ChargebackStatsTiles stats={stats} />

      <FilterCard
        className="mb-4 mt-6"
        actions={
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FilterField label="Status">
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v as ChargebackStatus | 'all');
                resetPaging();
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Order ID">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Filter by order ID…"
                value={orderId}
                onChange={(e) => {
                  setOrderId(e.target.value);
                  resetPaging();
                }}
                className="pl-8"
              />
            </div>
          </FilterField>
        </div>
      </FilterCard>

      {error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Failed to load chargebacks: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Evidence due</TableHead>
                <TableHead>Opened</TableHead>
                <TableHead>Reconcile</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState
                      icon={CreditCard}
                      title="No chargebacks match these filters"
                      description="Nothing to reconcile right now. Try widening filters to see closed disputes."
                      bordered={false}
                    />
                  </TableCell>
                </TableRow>
              )}
              {rows.map((cb) => (
                <ChargebackTableRow key={cb.id} cb={cb} />
              ))}
            </TableBody>
          </Table>
        </CardContent>

        {rows.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="text-muted-foreground">
              Showing <strong className="font-semibold text-foreground">{rows.length}</strong>{' '}
              chargeback{rows.length === 1 ? '' : 's'} on this page
            </span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Per page</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => {
                    setPageSize(Number(v));
                    resetPaging();
                  }}
                >
                  <SelectTrigger className="h-8 w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50, 100].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hasPrev}
                  onClick={() => setCursorStack((s) => s.slice(0, -1))}
                >
                  Previous
                </Button>
                <span className="px-3 text-sm text-muted-foreground">Page {pageIndex + 1}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hasNext}
                  onClick={() => setCursorStack((s) => [...s, data?.nextCursor ?? undefined])}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

// -- helpers -----------------------------------------------------------------

function ChargebackTableRow({ cb }: { cb: ChargebackRow }) {
  const urgent = isEvidenceUrgent(cb.evidenceDueBy);
  return (
    <TableRow>
      <TableCell className="font-mono text-sm">
        {/* No /orders/[id] detail route exists, so render plain text. */}
        {cb.order?.orderNumber ?? '-'}
      </TableCell>
      <TableCell className="text-right text-sm">{formatPence(cb.amountPence)}</TableCell>
      <TableCell>
        <StatusPill tone={STATUS_TONE[cb.status] ?? 'neutral'}>{statusLabel(cb.status)}</StatusPill>
      </TableCell>
      <TableCell className="text-sm capitalize">
        {cb.reason ? cb.reason.replace(/_/g, ' ') : '-'}
      </TableCell>
      <TableCell className="text-sm">
        {cb.evidenceDueBy ? (
          <span className={urgent ? 'font-semibold text-red-700' : undefined}>
            {formatDateTime(cb.evidenceDueBy)}
          </span>
        ) : (
          '-'
        )}
      </TableCell>
      <TableCell className="text-sm">{formatDateTime(cb.openedAt)}</TableCell>
      <TableCell>
        <ReconcileCell cb={cb} />
      </TableCell>
    </TableRow>
  );
}

function ReconcileCell({ cb }: { cb: ChargebackRow }) {
  // Reconciliation only matters for lost chargebacks: a lost dispute reverses
  // the payment, so finance must reconcile the order's ledger.
  if (cb.status !== 'lost') return <span className="text-sm text-muted-foreground">–</span>;
  if (cb.reconciledAt) {
    return <StatusPill tone="success">Reconciled</StatusPill>;
  }
  return <StatusPill tone="warning">Awaiting reconcile</StatusPill>;
}

function ChargebackStatsTiles({
  stats,
}: {
  stats:
    | {
        open: number;
        evidenceDueWithin72h: number;
        lostUnreconciled: number;
        openAmountPence: number;
      }
    | undefined;
}) {
  const tiles = [
    { label: 'Open', value: stats?.open ?? 0, format: 'number' as const },
    {
      label: 'Evidence due <72h',
      value: stats?.evidenceDueWithin72h ?? 0,
      format: 'number' as const,
      tone: 'danger' as const,
    },
    {
      label: 'Lost unreconciled',
      value: stats?.lostUnreconciled ?? 0,
      format: 'number' as const,
      tone: 'warning' as const,
    },
    {
      label: 'Open amount',
      value: stats?.openAmountPence ?? 0,
      format: 'money' as const,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardContent className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {tile.label}
            </div>
            <div className="mt-2 text-2xl font-bold text-foreground">
              {tile.format === 'money' ? formatPence(tile.value) : tile.value.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
