'use client';

import { useState } from 'react';

import {
  Badge,
  Button,
  Card,
  CardContent,
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
import { AlertTriangle, RefreshCcw, Trash2, RotateCcw } from 'lucide-react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/format';
import {
  useDeadLetterJobs,
  useRetryDeadLetterJob,
  useDiscardDeadLetterJob,
  type DeadLetterJob,
} from '@/hooks/use-dead-letters';

const ALL_QUEUES = 'all';
const KNOWN_QUEUES = [
  'notifications',
  'stripe-webhooks',
  'payouts',
  'compliance',
  'terms-notices',
  'hmrc',
];

function payloadSummary(payload: Record<string, unknown>): string {
  const keys = Object.keys(payload);
  if (keys.length === 0) return '(empty)';
  // Show the first two key=value pairs that aren't [REDACTED] and are short strings or numbers.
  const pairs = keys
    .map((k) => {
      const v = payload[k];
      if (v === '[REDACTED]') return null;
      if (typeof v === 'string' && v.length <= 64) return `${k}: ${v}`;
      if (typeof v === 'number') return `${k}: ${v}`;
      return null;
    })
    .filter(Boolean)
    .slice(0, 2);
  return pairs.length > 0 ? pairs.join(', ') : `{${keys.join(', ')}}`;
}

function JobRow({
  job,
  onRetry,
  onDiscard,
}: {
  job: DeadLetterJob;
  onRetry: (job: DeadLetterJob) => void;
  onDiscard: (job: DeadLetterJob) => void;
}) {
  const failedAt = job.finishedOn ? new Date(job.finishedOn) : null;

  return (
    <TableRow>
      <TableCell>
        <Badge variant="outline" className="font-mono text-xs">
          {job.queue}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className="font-mono text-xs">
          {job.name}
        </Badge>
      </TableCell>
      <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
        {job.failedReason ?? '–'}
      </TableCell>
      <TableCell className="text-sm font-medium text-destructive text-center">
        {job.attemptsMade}
      </TableCell>
      <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
        {payloadSummary(job.payload)}
      </TableCell>
      <TableCell className="text-sm whitespace-nowrap">
        {failedAt ? formatDate(failedAt.toISOString()) : '–'}
      </TableCell>
      <TableCell className="w-36">
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2"
            title="Re-enqueue this job for immediate retry. Action is recorded in server logs."
            onClick={() => {
              if (
                confirm(
                  `Retry job ${job.id} in queue "${job.queue}"?\n\nThis re-enqueues it for immediate execution. The action is recorded.`,
                )
              ) {
                onRetry(job);
              }
            }}
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Retry
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-destructive hover:bg-destructive/10"
            title="Permanently remove this job. Cannot be undone. Action is recorded."
            onClick={() => {
              if (
                confirm(
                  `Discard job ${job.id} in queue "${job.queue}"?\n\nThis permanently removes it. This cannot be undone. The action is recorded.`,
                )
              ) {
                onDiscard(job);
              }
            }}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Discard
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function DeadLettersClient() {
  const [queueFilter, setQueueFilter] = useState<string>(ALL_QUEUES);
  const { data, isLoading, error, refetch } = useDeadLetterJobs(
    queueFilter === ALL_QUEUES ? undefined : queueFilter,
  );
  const retry = useRetryDeadLetterJob();
  const discard = useDiscardDeadLetterJob();

  const jobs = data?.data ?? [];
  const isPending = retry.isPending || discard.isPending;

  return (
    <>
      <PageHeader
        title="Dead-letter Bull jobs"
        description="Failed jobs across all queues that have exhausted their retry budget. Retry to re-enqueue or discard to remove permanently. All actions are logged with your user ID."
        actions={
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RefreshCcw className="mr-1.5 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Failed to load dead-letter jobs: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      {(retry.isError || discard.isError) && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Action failed: {((retry.error ?? discard.error) as Error | null)?.message}
          </CardContent>
        </Card>
      )}

      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Filter by queue:</span>
        <Select value={queueFilter} onValueChange={setQueueFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_QUEUES}>All queues</SelectItem>
            {KNOWN_QUEUES.map((q) => (
              <SelectItem key={q} value={q}>
                {q}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {data && (
          <span className="text-sm text-muted-foreground">
            {data.count} job{data.count !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Queue</TableHead>
                <TableHead>Job type</TableHead>
                <TableHead>Error</TableHead>
                <TableHead className="text-center">Attempts</TableHead>
                <TableHead>Payload summary</TableHead>
                <TableHead>Failed at</TableHead>
                <TableHead className="w-36" />
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
              {!isLoading && jobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState
                      icon={AlertTriangle}
                      title="No dead-letter jobs"
                      description={
                        queueFilter === ALL_QUEUES
                          ? 'All queues are within their retry budget.'
                          : `No failed jobs in the "${queueFilter}" queue.`
                      }
                      bordered={false}
                    />
                  </TableCell>
                </TableRow>
              )}
              {jobs.map((job) => (
                <JobRow
                  key={`${job.queue}-${job.id}`}
                  job={job}
                  onRetry={(j) => retry.mutate({ queue: j.queue, jobId: j.id })}
                  onDiscard={(j) => discard.mutate({ queue: j.queue, jobId: j.id })}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {isPending && <p className="mt-2 text-xs text-muted-foreground">Processing action…</p>}
    </>
  );
}
