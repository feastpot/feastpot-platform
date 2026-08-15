'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
} from '@feastpot/ui';
import { FileText, Image as ImageIcon, Video } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { useToast } from '@/components/ui/toaster';
import {
  useCloseDispute,
  useDecideAppealStage1,
  useDecideAppealStage2,
  useDispute,
  useDisputeAppeal,
  useDisputeEvidence,
  useUpdateDispute,
  type AppealOutcome,
  type DisputeAppeal,
  type Evidence,
  type ResolutionType,
  type Severity,
} from '@/hooks/use-disputes';
import { formatDateTime, formatPence } from '@/lib/format';

const RESOLUTIONS: ResolutionType[] = [
  'full_refund',
  'partial_refund',
  'credit',
  'rejected',
  'escalated',
];
const SEVERITIES: Severity[] = ['low', 'medium', 'high', 'critical'];

export function DisputeDetailClient({ disputeId }: { disputeId: string }) {
  const { toast } = useToast();
  const { data: dispute } = useDispute(disputeId);
  const { data: evidence } = useDisputeEvidence(disputeId);
  const updateMutation = useUpdateDispute(disputeId);
  const closeMutation = useCloseDispute(disputeId);

  const { data: appeal } = useDisputeAppeal(disputeId);
  const stage1Mutation = useDecideAppealStage1(disputeId);
  const stage2Mutation = useDecideAppealStage2(disputeId);

  const [resolution, setResolution] = useState<ResolutionType>('full_refund');
  const [resolutionNote, setResolutionNote] = useState('');
  const [refundPounds, setRefundPounds] = useState('');
  const [viewing, setViewing] = useState<Evidence | null>(null);

  // Appeal review state
  const [s1Outcome, setS1Outcome] = useState<AppealOutcome>('UPHELD');
  const [s1Reasons, setS1Reasons] = useState('');
  const [s2Outcome, setS2Outcome] = useState<AppealOutcome>('UPHELD');
  const [s2Reasons, setS2Reasons] = useState('');

  function setSeverity(severity: Severity) {
    updateMutation.mutate(
      { severity },
      { onSuccess: () => toast({ title: `Severity → ${severity}` }) },
    );
  }

  function close() {
    const requiresAmount = resolution === 'full_refund' || resolution === 'partial_refund';
    const refundAmountPence =
      requiresAmount && refundPounds ? Math.round(parseFloat(refundPounds) * 100) : undefined;
    if (requiresAmount && (!refundAmountPence || refundAmountPence <= 0)) {
      toast({ title: 'Refund amount required', variant: 'destructive' });
      return;
    }
    closeMutation.mutate(
      { resolution, resolutionNote: resolutionNote || undefined, refundAmountPence },
      {
        onSuccess: () => toast({ title: 'Dispute closed' }),
        onError: (err) =>
          toast({
            title: 'Close failed',
            description: (err as Error).message,
            variant: 'destructive',
          }),
      },
    );
  }

  return (
    <>
      <PageHeader
        title="Dispute"
        description={
          dispute ? `Filed ${formatDateTime(dispute.createdAt)} · ${dispute.issueType}` : 'Loading…'
        }
        actions={
          <Link href="/disputes" className="text-sm text-muted-foreground hover:underline">
            ← Back
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Order summary */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Order</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {dispute && (
                <>
                  <Field
                    label="Order"
                    value={<span className="font-mono">{dispute.order.orderNumber}</span>}
                  />
                  <Field label="Total" value={formatPence(dispute.order.totalPence)} />
                  <Field label="Vendor" value={dispute.order.vendor.businessName} />
                  <Field
                    label="Customer"
                    value={
                      <>
                        {`${dispute.order.customer.firstName ?? ''} ${dispute.order.customer.lastName ?? ''}`.trim() ||
                          '-'}
                        <div className="text-xs text-muted-foreground">
                          {dispute.order.customer.email}
                        </div>
                      </>
                    }
                  />
                  <Field label="Severity" value={<Badge>{dispute.severity}</Badge>} />
                  <Field label="Status" value={<Badge>{dispute.status.replace('_', ' ')}</Badge>} />
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Description + evidence */}
        <div className="lg:col-span-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm">{dispute?.description ?? '-'}</p>
              {dispute?.resolutionNote && (
                <div className="mt-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Resolution note
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{dispute.resolutionNote}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Evidence ({evidence?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent>
              {(evidence ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No evidence attached.</p>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(evidence ?? []).map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setViewing(e)}
                    className="group flex flex-col gap-1 rounded-md border border-border p-2 text-left hover:border-vendor"
                  >
                    <div className="grid h-24 w-full place-items-center rounded bg-muted">
                      {e.type === 'image' ? (
                        <img
                          src={e.fileUrl}
                          alt={e.caption ?? ''}
                          className="h-full w-full rounded object-cover"
                        />
                      ) : e.type === 'video' ? (
                        <Video className="h-8 w-8 text-muted-foreground" />
                      ) : (
                        <FileText className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {e.caption ?? e.type}
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Resolution panel */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resolve</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Set severity
                </label>
                <div className="flex gap-2">
                  {SEVERITIES.map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={dispute?.severity === s ? 'default' : 'outline'}
                      onClick={() => setSeverity(s)}
                      disabled={updateMutation.isPending}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="border-t border-border pt-3">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Resolution
                </label>
                <Select
                  value={resolution}
                  onValueChange={(v) => setResolution(v as ResolutionType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESOLUTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(resolution === 'full_refund' || resolution === 'partial_refund') && (
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Refund amount (£)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={refundPounds}
                    onChange={(e) => setRefundPounds(e.target.value)}
                    placeholder={dispute ? (dispute.order.totalPence / 100).toFixed(2) : '0.00'}
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Notes
                </label>
                <Input
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder="Internal note"
                />
              </div>

              <Button
                className="w-full"
                onClick={close}
                disabled={closeMutation.isPending || dispute?.status === 'closed'}
              >
                Close dispute
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Appeal review panel */}
      {appeal && (
        <div className="mt-6">
          <AppealPanel
            disputeId={disputeId}
            appeal={appeal}
            s1Outcome={s1Outcome}
            setS1Outcome={setS1Outcome}
            s1Reasons={s1Reasons}
            setS1Reasons={setS1Reasons}
            s2Outcome={s2Outcome}
            setS2Outcome={setS2Outcome}
            s2Reasons={s2Reasons}
            setS2Reasons={setS2Reasons}
            stage1Mutation={stage1Mutation}
            stage2Mutation={stage2Mutation}
            toast={toast}
          />
        </div>
      )}

      <Dialog open={Boolean(viewing)} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{viewing?.caption ?? 'Evidence'}</DialogTitle>
          </DialogHeader>
          {viewing?.type === 'image' && (
            <img
              src={viewing.fileUrl}
              alt={viewing.caption ?? ''}
              className="max-h-[70vh] w-full rounded object-contain"
            />
          )}
          {viewing && viewing.type !== 'image' && (
            <div className="flex flex-col items-center gap-3 py-6">
              {viewing.type === 'video' ? (
                <Video className="h-12 w-12" />
              ) : (
                <ImageIcon className="h-12 w-12" />
              )}
              <a
                href={viewing.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-vendor underline"
              >
                Open original
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

const APPEAL_OUTCOME_LABELS: Record<AppealOutcome, string> = {
  UPHELD: 'Upheld',
  OVERTURNED: 'Overturned',
  PARTIAL: 'Partial',
};

function AppealPanel({
  disputeId: _disputeId,
  appeal,
  s1Outcome,
  setS1Outcome,
  s1Reasons,
  setS1Reasons,
  s2Outcome,
  setS2Outcome,
  s2Reasons,
  setS2Reasons,
  stage1Mutation,
  stage2Mutation,
  toast,
}: {
  disputeId: string;
  appeal: DisputeAppeal;
  s1Outcome: AppealOutcome;
  setS1Outcome: (v: AppealOutcome) => void;
  s1Reasons: string;
  setS1Reasons: (v: string) => void;
  s2Outcome: AppealOutcome;
  setS2Outcome: (v: AppealOutcome) => void;
  s2Reasons: string;
  setS2Reasons: (v: string) => void;
  stage1Mutation: ReturnType<typeof useDecideAppealStage1>;
  stage2Mutation: ReturnType<typeof useDecideAppealStage2>;
  toast: ReturnType<typeof import('@/components/ui/toaster').useToast>['toast'];
}) {
  const OUTCOMES: AppealOutcome[] = ['UPHELD', 'OVERTURNED', 'PARTIAL'];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Appeal (clause 18.1-18.3)</CardTitle>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
          {appeal.stage2At ? 'Final' : appeal.stage1At ? 'Stage 2 pending' : 'Stage 1 pending'}
        </span>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Grounds
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm">{appeal.grounds}</p>
          <div className="mt-1 text-xs text-muted-foreground">
            Submitted {new Date(appeal.submittedAt).toLocaleDateString('en-GB')} &middot; Deadline{' '}
            {new Date(appeal.deadline).toLocaleDateString('en-GB')}
          </div>
        </div>

        {/* Stage 1 */}
        {appeal.stage1At ? (
          <div className="rounded-md border border-border bg-surface p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Stage 1 outcome
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Badge>
                {appeal.stage1Outcome ? APPEAL_OUTCOME_LABELS[appeal.stage1Outcome] : '-'}
              </Badge>
              <span className="text-xs text-muted-foreground">
                by {appeal.stage1By?.slice(0, 8)}
              </span>
            </div>
            {appeal.stage1Reasons && (
              <p className="mt-1 text-xs text-muted-foreground">{appeal.stage1Reasons}</p>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-border bg-surface p-3 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Stage 1 review (written reasons required)
            </div>
            <div className="flex gap-2">
              {OUTCOMES.map((o) => (
                <Button
                  key={o}
                  size="sm"
                  variant={s1Outcome === o ? 'default' : 'outline'}
                  onClick={() => setS1Outcome(o)}
                >
                  {APPEAL_OUTCOME_LABELS[o]}
                </Button>
              ))}
            </div>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
              rows={3}
              value={s1Reasons}
              onChange={(e) => setS1Reasons(e.target.value)}
              placeholder="Written reasons (min 50 characters)..."
            />
            <p className="text-[10px] text-muted-foreground">{s1Reasons.length}/50 min</p>
            <Button
              size="sm"
              disabled={stage1Mutation.isPending || s1Reasons.trim().length < 50}
              onClick={() => {
                stage1Mutation.mutate(
                  { outcome: s1Outcome, reasons: s1Reasons },
                  {
                    onSuccess: () => toast({ title: 'Stage 1 decision recorded' }),
                    onError: (err) =>
                      toast({ title: (err as Error).message, variant: 'destructive' }),
                  },
                );
              }}
            >
              {stage1Mutation.isPending ? 'Saving…' : 'Record Stage 1 decision'}
            </Button>
          </div>
        )}

        {/* Stage 2 - only shown after Stage 1 is decided */}
        {appeal.stage1At &&
          (appeal.stage2At ? (
            <div className="rounded-md border border-border bg-surface p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Stage 2 outcome (final)
              </div>
              <div className="mt-1 flex items-center gap-2">
                <Badge>
                  {appeal.stage2Outcome ? APPEAL_OUTCOME_LABELS[appeal.stage2Outcome] : '-'}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  by {appeal.stage2By?.slice(0, 8)}
                </span>
              </div>
              {appeal.stage2Reasons && (
                <p className="mt-1 text-xs text-muted-foreground">{appeal.stage2Reasons}</p>
              )}
              {appeal.stage2Outcome === 'UPHELD' && (
                <p className="mt-1 text-xs font-medium text-green-700">
                  Payout deduction reversed automatically.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Stage 2 review - must be a DIFFERENT reviewer from Stage 1
              </div>
              <div className="flex gap-2">
                {OUTCOMES.map((o) => (
                  <Button
                    key={o}
                    size="sm"
                    variant={s2Outcome === o ? 'default' : 'outline'}
                    onClick={() => setS2Outcome(o)}
                  >
                    {APPEAL_OUTCOME_LABELS[o]}
                  </Button>
                ))}
              </div>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                rows={3}
                value={s2Reasons}
                onChange={(e) => setS2Reasons(e.target.value)}
                placeholder="Written reasons (min 50 characters)..."
              />
              <p className="text-[10px] text-muted-foreground">{s2Reasons.length}/50 min</p>
              <Button
                size="sm"
                disabled={stage2Mutation.isPending || s2Reasons.trim().length < 50}
                onClick={() => {
                  stage2Mutation.mutate(
                    { outcome: s2Outcome, reasons: s2Reasons },
                    {
                      onSuccess: () =>
                        toast({
                          title:
                            stage2Mutation.data?.stage2Outcome === 'UPHELD'
                              ? 'Appeal upheld - payout credit queued'
                              : 'Stage 2 decision recorded',
                        }),
                      onError: (err) =>
                        toast({ title: (err as Error).message, variant: 'destructive' }),
                    },
                  );
                }}
              >
                {stage2Mutation.isPending ? 'Saving…' : 'Record final decision'}
              </Button>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm">{value}</div>
    </div>
  );
}
