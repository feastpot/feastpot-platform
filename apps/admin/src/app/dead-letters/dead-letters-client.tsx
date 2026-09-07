'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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
  useBulkDeadLetterJobs,
  type DeadLetterJob,
} from '@/hooks/use-dead-letters';
import { NotificationsClient } from '../notifications/notifications-client';

const ALL_QUEUES = 'all';
const KNOWN_QUEUES = [
  'notifications',
  'stripe-webhooks',
  'payouts',
  'compliance',
  'terms-notices',
  'hmrc',
  'attribution-qr',
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
  selected,
  onToggle,
}: {
  job: DeadLetterJob;
  onRetry: (job: DeadLetterJob) => void;
  onDiscard: (job: DeadLetterJob) => void;
  selected: boolean;
  onToggle: () => void;
}) {
  const failedAt = job.finishedOn ? new Date(job.finishedOn) : null;

  return (
    <TableRow>
      <TableCell>
        <input
          aria-label={`Select job ${job.id}`}
          type="checkbox"
          checked={selected}
          onChange={onToggle}
        />
      </TableCell>
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

export function BullJobsPanel() {
  const [queueFilter, setQueueFilter] = useState<string>(ALL_QUEUES);
  const [selected, setSelected] = useState<string[]>([]);
  const { data, isLoading, error, refetch } = useDeadLetterJobs(
    queueFilter === ALL_QUEUES ? undefined : queueFilter,
  );
  const retry = useRetryDeadLetterJob();
  const discard = useDiscardDeadLetterJob();
  const bulk = useBulkDeadLetterJobs();

  const jobs = data?.data ?? [];
  const isPending = retry.isPending || discard.isPending || bulk.isPending;
  const selectedJobs = jobs.filter((job) => selected.includes(`${job.queue}:${job.id}`));
  const toggle = (job: DeadLetterJob) => {
    const key = `${job.queue}:${job.id}`;
    setSelected((current) =>
      current.includes(key) ? current.filter((id) => id !== key) : [...current, key],
    );
  };
  const runBulk = (action: 'retry' | 'discard') => {
    if (!selectedJobs.length) return;
    const verb = action === 'retry' ? 'retry' : 'permanently discard';
    if (
      confirm(
        `${verb.charAt(0).toUpperCase()}${verb.slice(1)} ${selectedJobs.length} selected failed job(s)?\n\nOnly the selected jobs will be changed. This action is audited.`,
      )
    ) {
      bulk.mutate(
        { action, jobs: selectedJobs.map(({ queue, id }) => ({ queue, jobId: id })) },
        { onSuccess: () => setSelected([]) },
      );
    }
  };

  return (
    <>
      <PageHeader
        title="Bull jobs"
        description="Failed jobs that exhausted their retry budget. Retrying re-enqueues the original job immediately; discard is permanent. Every action is audited."
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
      <div className="mb-4 flex items-center gap-2" aria-label="Bulk Bull job actions">
        <Button
          size="sm"
          variant="outline"
          disabled={!selectedJobs.length || isPending}
          onClick={() => runBulk('retry')}
        >
          <RotateCcw className="mr-1.5 h-4 w-4" /> Retry selected ({selectedJobs.length})
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-destructive hover:bg-destructive/10"
          disabled={!selectedJobs.length || isPending}
          onClick={() => runBulk('discard')}
        >
          <Trash2 className="mr-1.5 h-4 w-4" /> Discard selected
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    aria-label="Select all Bull jobs"
                    type="checkbox"
                    checked={jobs.length > 0 && selectedJobs.length === jobs.length}
                    onChange={() =>
                      setSelected(
                        selectedJobs.length === jobs.length
                          ? []
                          : jobs.map((job) => `${job.queue}:${job.id}`),
                      )
                    }
                  />
                </TableHead>
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
                  <TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && jobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
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
                  selected={selected.includes(`${job.queue}:${job.id}`)}
                  onToggle={() => toggle(job)}
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

export function DeadLettersClient() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get('tab') === 'notifications' ? 'notifications' : 'jobs';
  const selectTab = (next: 'jobs' | 'notifications') => {
    const nextParams = new URLSearchParams(params.toString());
    if (next === 'jobs') nextParams.delete('tab');
    else nextParams.set('tab', 'notifications');
    router.replace(`/dead-letters${nextParams.size ? `?${nextParams}` : ''}`);
  };
  return (
    <>
      <div className="mb-6 border-b border-border" role="tablist" aria-label="Dead-letter sources">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'jobs'}
          onClick={() => selectTab('jobs')}
          className={`px-4 py-3 text-sm font-medium ${tab === 'jobs' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground'}`}
        >
          Bull jobs
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'notifications'}
          onClick={() => selectTab('notifications')}
          className={`px-4 py-3 text-sm font-medium ${tab === 'notifications' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground'}`}
        >
          Notification outbox
        </button>
      </div>
      <div role="tabpanel">
        {tab === 'jobs' ? <BullJobsPanel /> : <NotificationsClient embedded />}
      </div>
    </>
  );
}
