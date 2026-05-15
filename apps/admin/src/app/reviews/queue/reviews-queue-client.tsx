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
import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import {
  useModerateReview,
  useReviewsQueue,
  type ModerationQueueRow,
  type ModerationStatus,
} from '@/hooks/use-reviews-queue';
import { formatDate } from '@/lib/format';

/**
 * Reviews moderation queue. Server-side this list is hardcoded to
 * `moderationStatus = held` — the API does not accept a status filter — so
 * we don't render filter chips. Reviews disappear from the page as soon as
 * the moderate mutation invalidates the cache.
 */
export function ReviewsQueueClient() {
  const { data, isLoading, error } = useReviewsQueue();
  const moderate = useModerateReview();
  // Per-row in-flight set so two rapid clicks on different rows don't allow
  // duplicate PATCHes on the same id (TanStack `useMutation` permits
  // concurrent invocations).
  const [inFlight, setInFlight] = useState<Set<string>>(new Set());

  const reviews = data?.data ?? [];

  async function moderateOnce(
    row: ModerationQueueRow,
    status: 'approved' | 'rejected',
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

  async function handleApprove(row: ModerationQueueRow) {
    await moderateOnce(row, 'approved');
  }

  async function handleReject(row: ModerationQueueRow) {
    // window.prompt is intentionally simple — moderation is rare and
    // building a full dialog isn't justified by the volume. Cancel returns
    // null and MUST short-circuit; otherwise the moderator's "back out"
    // gesture would still reject the review.
    const raw = window.prompt('Rejection reason (optional, max 500 chars):');
    if (raw === null) return;
    const trimmed = raw.trim();
    if (trimmed.length > 500) {
      window.alert('Reason must be 500 characters or fewer.');
      return;
    }
    await moderateOnce(row, 'rejected', trimmed.length > 0 ? trimmed : undefined);
  }

  return (
    <>
      <PageHeader
        title="Reviews moderation"
        description="Reviews flagged by the auto-moderator. Approve to publish, reject to hide."
      />

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
                <TableHead className="w-56 text-right">Actions</TableHead>
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
                    No reviews are waiting for moderation.
                  </TableCell>
                </TableRow>
              )}
              {reviews.map((r) => {
                const isBusy = inFlight.has(r.id);
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
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() => handleReject(r)}
                          className="border-destructive/40 text-destructive hover:bg-destructive/10"
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          disabled={isBusy}
                          onClick={() => handleApprove(r)}
                        >
                          Approve
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function StatusPill({ status }: { status: ModerationStatus }) {
  const styles: Record<ModerationStatus, string> = {
    pending: 'bg-amber-100 text-amber-900',
    approved: 'bg-emerald-100 text-emerald-900',
    auto_approved: 'bg-teal-light text-teal-dark',
    rejected: 'bg-red-100 text-red-900',
    held: 'bg-indigo-100 text-indigo-900',
  };
  return <Badge className={styles[status]}>{status.replace('_', ' ')}</Badge>;
}
