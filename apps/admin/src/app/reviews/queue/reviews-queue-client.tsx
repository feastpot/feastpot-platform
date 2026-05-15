'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@feastpot/ui';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import {
  useModerateReview,
  useReviewsQueue,
  type ModerationQueueFilter,
  type ModerationQueueRow,
  type ModerationStatus,
} from '@/hooks/use-reviews-queue';
import { formatDate } from '@/lib/format';

// D18: filter tabs across the moderation lifecycle. 'all' is first +
// the default, matching the spec.
// No 'pending' — the prisma ModerationStatus enum only has auto_approved /
// held / approved / rejected. Auto-moderate writes one of the first two on
// review creation; pending isn't a state in this schema.
const FILTER_TABS: ReadonlyArray<ModerationQueueFilter> = [
  'all',
  'auto_approved',
  'held',
  'approved',
  'rejected',
];

const REJECT_REASON_MIN = 10;
const REJECT_REASON_MAX = 500;

/**
 * Reviews moderation queue.
 *
 * D18: queue endpoint now accepts a `status` filter — UI exposes one tab
 * per status plus 'all'. Server defaults to `held` if status is omitted,
 * so this client always passes the filter explicitly.
 *
 * D19: 'Hold' button is available on any non-held review (push back into
 * the moderation queue). Released reviews show Approve/Reject as before.
 *
 * D20: rejection reason captured via shadcn Dialog (not window.prompt).
 * Reason is required — min 10 chars — because it lands in the audit log.
 */
export function ReviewsQueueClient() {
  const [filter, setFilter] = useState<ModerationQueueFilter>('all');
  const { data, isLoading, error } = useReviewsQueue(filter);
  const moderate = useModerateReview();

  // Per-row in-flight set so two rapid clicks on different rows don't allow
  // duplicate PATCHes on the same id (TanStack `useMutation` permits
  // concurrent invocations).
  const [inFlight, setInFlight] = useState<Set<string>>(new Set());

  // D20: dialog state for the reject-reason capture.
  const [rejectTarget, setRejectTarget] = useState<ModerationQueueRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const reviews = data?.data ?? [];

  async function moderateOnce(
    row: ModerationQueueRow,
    status: 'approved' | 'rejected' | 'held',
    reason?: string,
  ) {
    if (inFlight.has(row.id)) return;
    setInFlight((prev) => new Set(prev).add(row.id));
    try {
      await moderate.mutateAsync({ id: row.id, status, reason });
    } finally {
      setInFlight((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  }

  function openRejectDialog(row: ModerationQueueRow) {
    setRejectTarget(row);
    setRejectReason('');
  }

  function closeRejectDialog() {
    setRejectTarget(null);
    setRejectReason('');
  }

  async function confirmReject() {
    if (!rejectTarget) return;
    const trimmed = rejectReason.trim();
    if (trimmed.length < REJECT_REASON_MIN || trimmed.length > REJECT_REASON_MAX) return;
    const target = rejectTarget;
    closeRejectDialog();
    await moderateOnce(target, 'rejected', trimmed);
  }

  const reasonLength = rejectReason.trim().length;
  const reasonValid = reasonLength >= REJECT_REASON_MIN && reasonLength <= REJECT_REASON_MAX;

  return (
    <>
      <PageHeader
        title="Reviews moderation"
        description="Approve to publish, reject to hide, or hold to flag for a second look."
      />

      {/* Filter tabs (D18) */}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTER_TABS.map((tab) => (
          <Button
            key={tab}
            size="sm"
            variant={filter === tab ? 'default' : 'outline'}
            onClick={() => setFilter(tab)}
          >
            {tab.replace('_', ' ')}
          </Button>
        ))}
      </div>

      {error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Failed to load reviews: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Submitted</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Review</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-72 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && reviews.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    No reviews match this filter.
                  </TableCell>
                </TableRow>
              )}
              {reviews.map((r) => {
                const isBusy = inFlight.has(r.id);
                const isHeld = r.moderationStatus === 'held';
                const isPublished =
                  r.moderationStatus === 'approved' || r.moderationStatus === 'auto_approved';
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{formatDate(r.createdAt)}</TableCell>
                    <TableCell className="text-sm">{r.vendor.businessName}</TableCell>
                    <TableCell>
                      <span className="font-medium text-amber-600" aria-label={`${r.rating} out of 5`}>
                        {'★'.repeat(r.rating)}
                        <span className="text-muted-foreground/50">{'★'.repeat(Math.max(0, 5 - r.rating))}</span>
                      </span>
                    </TableCell>
                    <TableCell className="max-w-md text-sm">
                      {r.title && <div className="font-medium">{r.title}</div>}
                      <div className="italic text-muted-foreground">
                        {r.body ? `“${r.body}”` : <span className="not-italic">(no comment)</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusPill status={r.moderationStatus} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {/* Approve: any non-approved review can be approved
                            (publishes it / re-publishes a held one). */}
                        {r.moderationStatus !== 'approved' && (
                          <Button
                            size="sm"
                            disabled={isBusy}
                            onClick={() => moderateOnce(r, 'approved')}
                          >
                            {isHeld ? 'Release' : 'Approve'}
                          </Button>
                        )}
                        {/* Reject: any non-rejected review can be rejected. */}
                        {r.moderationStatus !== 'rejected' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isBusy}
                            onClick={() => openRejectDialog(r)}
                            className="border-destructive/40 text-destructive hover:bg-destructive/10"
                          >
                            Reject
                          </Button>
                        )}
                        {/* D19: Hold — only meaningful for non-held rows.
                            Lets an admin re-queue a published review. */}
                        {!isHeld && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isBusy}
                            onClick={() => moderateOnce(r, 'held')}
                            title={
                              isPublished
                                ? 'Push back into the moderation queue'
                                : 'Re-flag this review for moderation'
                            }
                          >
                            Hold
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* D20: reject-reason dialog. Replaces window.prompt. */}
      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) closeRejectDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject review</DialogTitle>
            <DialogDescription>
              This review will be hidden from the vendor&apos;s profile and the rating recalculated.
              A reason is required for the audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={`Reason for rejection (min ${REJECT_REASON_MIN} characters)`}
              maxLength={REJECT_REASON_MAX}
              className="min-h-[96px] w-full resize-y rounded-md border bg-background px-3 py-2 text-sm font-[inherit] outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              autoFocus
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span
                className={
                  reasonLength > 0 && reasonLength < REJECT_REASON_MIN ? 'text-destructive' : ''
                }
              >
                {reasonLength < REJECT_REASON_MIN
                  ? `${REJECT_REASON_MIN - reasonLength} more character${REJECT_REASON_MIN - reasonLength === 1 ? '' : 's'} needed`
                  : 'Looks good'}
              </span>
              <span>
                {reasonLength}/{REJECT_REASON_MAX}
              </span>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={closeRejectDialog}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!reasonValid}
              onClick={confirmReject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirm rejection
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusPill({ status }: { status: ModerationStatus }) {
  const styles: Record<ModerationStatus, string> = {
    approved: 'bg-emerald-100 text-emerald-900',
    auto_approved: 'bg-teal-light text-teal-dark',
    rejected: 'bg-red-100 text-red-900',
    held: 'bg-indigo-100 text-indigo-900',
  };
  return <Badge className={styles[status]}>{status.replace('_', ' ')}</Badge>;
}
