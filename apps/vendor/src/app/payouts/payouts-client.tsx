'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@feastpot/ui';
import { Download, Info } from 'lucide-react';
import { useMemo } from 'react';

import { usePayouts, type PayoutStatus, type VendorPayout } from '@/hooks/use-payouts';
import { formatDate, formatPence } from '@/lib/format';

const STATUS_BADGE: Record<PayoutStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  held: { label: 'Held', variant: 'destructive' },
  approved: { label: 'Approved', variant: 'default' },
  transferred: { label: 'Transferred', variant: 'default' },
  failed: { label: 'Failed', variant: 'destructive' },
};

export function PayoutsClient() {
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = usePayouts();

  const payouts: VendorPayout[] = useMemo(
    () => data?.pages.flatMap((p) => p.data) ?? [],
    [data],
  );

  // "Current week" pending = the most recent draft + held (those are not yet
  // transferred). Sum gives the vendor a quick "what's coming" number.
  const pending = useMemo(() => {
    const ps = payouts.filter((p) => p.status === 'draft' || p.status === 'held');
    return ps.reduce(
      (acc, p) => ({
        gross: acc.gross + p.grossPence,
        commission: acc.commission + p.commissionPence,
        refunds: acc.refunds + p.refundsPence,
        net: acc.net + p.amountPence,
      }),
      { gross: 0, commission: 0, refunds: 0, net: 0 },
    );
  }, [payouts]);

  const heldPayouts = payouts.filter((p) => p.status === 'held' && p.holdReason);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Payouts</h1>
        <p className="text-sm text-muted-foreground">
          Weekly transfers run every Monday for the previous Mon–Sun window.
        </p>
      </div>

      {heldPayouts.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <Info className="mt-0.5 h-4 w-4 text-destructive" />
            <div>
              <p className="font-medium text-destructive">A payout is on hold</p>
              {heldPayouts.map((p) => (
                <p key={p.id} className="text-destructive/80">
                  Period ending {formatDate(p.periodEnd)}: {p.holdReason}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pending net" value={formatPence(pending.net)} />
        <StatCard label="Pending gross" value={formatPence(pending.gross)} />
        <StatCard label="Commission deducted" value={formatPence(pending.commission)} />
        <StatCard label="Refunds deducted" value={formatPence(pending.refunds)} />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">History</h2>
        <Button variant="outline" disabled className="gap-2" title="Coming soon">
          <Download className="h-4 w-4" /> Download statement
        </Button>
      </div>

      {error && (
        <Card><CardContent className="p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Could not load payouts'}
        </CardContent></Card>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Week ending</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Commission</TableHead>
              <TableHead className="text-right">Refunds</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Transferred</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!isLoading && payouts.length === 0 && (
              <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">No payouts yet - your first will land next Monday.</TableCell></TableRow>
            )}
            {payouts.map((p) => {
              const badge = STATUS_BADGE[p.status];
              return (
                <TableRow key={p.id}>
                  <TableCell>{formatDate(p.periodEnd)}</TableCell>
                  <TableCell className="text-right">{formatPence(p.grossPence)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">−{formatPence(p.commissionPence)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">−{formatPence(p.refundsPence)}</TableCell>
                  <TableCell className="text-right font-medium">{formatPence(p.amountPence)}</TableCell>
                  <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
                  <TableCell>{formatDate(p.transferredAt)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
