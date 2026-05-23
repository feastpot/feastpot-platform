'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { AlertTriangle, Banknote, CheckCircle2, Clock, Percent, Play } from 'lucide-react';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/ui/stat-card';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toaster';
import {
  useApprovePayout,
  useHoldPayout,
  usePayouts,
  useReconcilePayout,
  type PayoutStatus,
  type ReconcileResult,
} from '@/hooks/use-payouts';
import { apiRequest } from '@/lib/api/client';
import { formatDate, formatPence } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';

function DialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 flex justify-end gap-2">{children}</div>;
}

const STATUSES: ReadonlyArray<PayoutStatus | 'all'> = ['draft', 'approved', 'held', 'transferred', 'failed', 'all'];

interface PayoutsClientProps {
  role: 'admin' | 'support' | 'finance' | 'compliance';
}

export function PayoutsClient({ role }: PayoutsClientProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<PayoutStatus | 'all'>('draft');
  const { data, isLoading, error } = usePayouts({ status: status === 'all' ? undefined : status });

  const approveMutation = useApprovePayout();
  const holdMutation = useHoldPayout();
  const reconcileMutation = useReconcilePayout();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [holdTarget, setHoldTarget] = useState<{ id: string; vendor: string } | null>(null);
  const [holdReason, setHoldReason] = useState('');
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null);
  const [isRunningBatch, setIsRunningBatch] = useState(false);

  const isAdmin = role === 'admin';

  // D13: manual out-of-cycle payout batch trigger. Spec called for finance
  // visibility too on the API, but the UI button is admin-only because
  // accidental clicks affect every vendor - finance can still trigger via
  // the API directly if needed.
  async function handleManualRun() {
    const confirmed = window.confirm(
      'This will run the payout batch for all pending orders. ' +
        'Payouts already transferred this week will not be duplicated. Continue?',
    );
    if (!confirmed) return;

    setIsRunningBatch(true);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token ?? null;
      const result = await apiRequest<{ message: string; jobId: string }>(
        '/admin/payouts/run-batch',
        { method: 'POST', accessToken },
      );
      toast({
        title: 'Payout batch queued',
        description: `${result.message} (job ${result.jobId})`,
      });
    } catch (err) {
      toast({
        title: 'Failed to queue payout batch',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      // Brief debounce on the spinner so a single click doesn't get
      // re-fired by twitchy admins; the actual batch is idempotent so
      // a second click is safe but noisy in the logs.
      setTimeout(() => setIsRunningBatch(false), 5000);
    }
  }

  const draftRows = data?.data ?? [];
  const totalSelectedPence = useMemo(
    () => draftRows.filter((r) => selected.has(r.id)).reduce((sum, r) => sum + r.amountPence, 0),
    [draftRows, selected],
  );

  const summary = useMemo(() => {
    const rows = data?.data ?? [];
    let amount = 0;
    let commission = 0;
    let successful = 0;
    let pending = 0;
    let failedOrHeld = 0;
    for (const r of rows) {
      amount += r.amountPence;
      commission += r.commissionPence;
      if (r.status === 'transferred') successful += 1;
      else if (r.status === 'draft' || r.status === 'approved') pending += 1;
      else if (r.status === 'failed' || r.status === 'held') failedOrHeld += 1;
    }
    const commissionPct = amount > 0 ? (commission / amount) * 100 : 0;
    return { amount, commission, commissionPct, successful, pending, failedOrHeld, count: rows.length };
  }, [data]);

  function toggleAll(checked: boolean) {
    if (checked) {
      setSelected(new Set(draftRows.filter((r) => r.status === 'draft').map((r) => r.id)));
    } else {
      setSelected(new Set());
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function approveSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    let ok = 0;
    let failed = 0;
    // Sequential so a single error doesn't kill the rest of the batch silently.
    for (const id of ids) {
      try {
        await approveMutation.mutateAsync(id);
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    setSelected(new Set());
    toast({
      title: `Approved ${ok} payout${ok === 1 ? '' : 's'}`,
      description: failed > 0 ? `${failed} failed - check logs.` : undefined,
      variant: failed > 0 ? 'destructive' : 'default',
    });
  }

  function confirmHold() {
    if (!holdTarget || !holdReason.trim()) return;
    holdMutation.mutate(
      { id: holdTarget.id, holdReason },
      {
        onSuccess: () => {
          toast({ title: 'Payout placed on hold' });
          setHoldTarget(null);
          setHoldReason('');
        },
        onError: (err) => toast({ title: 'Hold failed', description: (err as Error).message, variant: 'destructive' }),
      },
    );
  }

  function reconcile(id: string) {
    reconcileMutation.mutate(id, {
      onSuccess: (res) => setReconcileResult(res),
      onError: (err) => toast({ title: 'Reconcile failed', description: (err as Error).message, variant: 'destructive' }),
    });
  }

  return (
    <>
      <PageHeader
        title="Payouts"
        description="Batch approve drafts, hold suspicious transfers, reconcile against Stripe."
        actions={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleManualRun}
                disabled={isRunningBatch}
              >
                <Play className="mr-1 h-4 w-4" aria-hidden="true" />
                {isRunningBatch ? 'Batch queued…' : 'Run payouts now'}
              </Button>
            )}
            {status === 'draft' && selected.size > 0 ? (
              <Button onClick={approveSelected} disabled={approveMutation.isPending}>
                Approve {selected.size} ({formatPence(totalSelectedPence)})
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 w-48">
        <Select value={status} onValueChange={(v) => { setStatus(v as PayoutStatus | 'all'); setSelected(new Set()); }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatCard
          icon={Banknote}
          tone="brand"
          label="Total payout amount"
          value={formatPence(summary.amount)}
          caption={`Across ${summary.count} payout${summary.count === 1 ? '' : 's'}`}
        />
        <StatCard
          icon={Percent}
          tone="brand"
          label="Total commission"
          value={formatPence(summary.commission)}
          caption={`${summary.commissionPct.toFixed(1)}% of payout amount`}
        />
        <StatCard
          icon={CheckCircle2}
          tone="teal"
          label="Successful"
          value={summary.successful.toString()}
          caption="Transferred to Stripe"
        />
        <StatCard
          icon={Clock}
          tone="amber"
          label="Pending"
          value={summary.pending.toString()}
          caption="Awaiting approval or transfer"
        />
        <StatCard
          icon={AlertTriangle}
          tone="red"
          label="Failed / Held"
          value={summary.failedOrHeld.toString()}
          caption="Needs review"
        />
      </div>

      {error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Failed to load payouts: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {status === 'draft' && (
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      onChange={(e) => toggleAll(e.target.checked)}
                      checked={selected.size > 0 && selected.size === draftRows.filter((r) => r.status === 'draft').length}
                    />
                  </TableHead>
                )}
                <TableHead>Vendor</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead className="text-right">Stripe transfer</TableHead>
                <TableHead className="w-72" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!isLoading && draftRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
                    <EmptyState
                      icon={Banknote}
                      title="No payouts in this state"
                      description="Try a different status filter or run a payout batch."
                      bordered={false}
                    />
                  </TableCell>
                </TableRow>
              )}
              {draftRows.map((p) => (
                <TableRow key={p.id}>
                  {status === 'draft' && (
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleOne(p.id)}
                        disabled={p.status !== 'draft'}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium">{p.vendor?.businessName ?? p.vendorId.slice(0, 8)}</TableCell>
                  <TableCell className="text-sm">{p.periodStart ? formatDate(p.periodStart) : '-'} → {p.periodEnd ? formatDate(p.periodEnd) : '-'}</TableCell>
                  <TableCell><PayoutStatusPill status={p.status} /></TableCell>
                  <TableCell className="text-right">{formatPence(p.amountPence)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatPence(p.commissionPence)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{p.stripeTransferId ?? '-'}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      {p.status === 'draft' && (
                        <Button size="sm" onClick={() => approveMutation.mutate(p.id, { onSuccess: () => toast({ title: 'Approved' }) })}>
                          Approve
                        </Button>
                      )}
                      {(p.status === 'draft' || p.status === 'approved') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setHoldTarget({ id: p.id, vendor: p.vendor?.businessName ?? '' }); setHoldReason(''); }}
                        >
                          Hold
                        </Button>
                      )}
                      {p.stripeTransferId && (
                        <Button size="sm" variant="ghost" onClick={() => reconcile(p.id)}>
                          Reconcile
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(holdTarget)} onOpenChange={(open) => !open && setHoldTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hold payout - {holdTarget?.vendor}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Reason</label>
            <Input value={holdReason} onChange={(e) => setHoldReason(e.target.value)} placeholder="Awaiting compliance review" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHoldTarget(null)}>Cancel</Button>
            <Button onClick={confirmHold} disabled={!holdReason.trim() || holdMutation.isPending}>Place hold</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reconcileResult)} onOpenChange={(open) => !open && setReconcileResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stripe reconciliation</DialogTitle>
          </DialogHeader>
          {reconcileResult && (
            <dl className="space-y-2 py-2 text-sm">
              <ReconRow label="Status" value={<Badge>{reconcileResult.status}</Badge>} />
              <ReconRow label="Stripe transfer" value={<span className="font-mono text-xs">{reconcileResult.stripeTransferId ?? '-'}</span>} />
              <ReconRow label="Our amount" value={formatPence(reconcileResult.ourAmountPence)} />
              <ReconRow label="Stripe amount" value={reconcileResult.stripeAmountPence !== null ? formatPence(reconcileResult.stripeAmountPence) : '-'} />
              <ReconRow
                label="Discrepancy"
                value={
                  reconcileResult.discrepancyPence === null
                    ? '-'
                    : reconcileResult.discrepancyPence === 0
                      ? '✅ Match'
                      : `⚠ ${formatPence(reconcileResult.discrepancyPence)}`
                }
              />
              {reconcileResult.error && <p className="text-sm text-destructive">{reconcileResult.error}</p>}
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function PayoutStatusPill({ status }: { status: PayoutStatus }) {
  const tone: Record<PayoutStatus, StatusTone> = {
    draft: 'neutral',
    approved: 'info',
    held: 'warning',
    transferred: 'success',
    failed: 'danger',
  };
  return <StatusPill tone={tone[status]}>{status === 'transferred' ? 'Paid' : status}</StatusPill>;
}

function ReconRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border pb-1.5">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}
