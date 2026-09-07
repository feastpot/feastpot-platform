'use client';

import { useState } from 'react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@feastpot/ui';
import { Bell, RefreshCcw, RotateCcw, Trash2 } from 'lucide-react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import {
  useBulkOutboxRows,
  useDeadLetterOutbox,
  useDiscardOutboxRow,
  useResendOutboxRow,
} from '@/hooks/use-notification-outbox';
import { formatDate } from '@/lib/format';

export function NotificationsClient({ embedded = false }: { embedded?: boolean }) {
  const [event, setEvent] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const { data, isLoading, error, refetch } = useDeadLetterOutbox(
    event === 'all' ? undefined : event,
  );
  const resend = useResendOutboxRow();
  const discard = useDiscardOutboxRow();
  const bulk = useBulkOutboxRows();

  const rows = data?.data ?? [];
  const eventNames = [...new Set(rows.map((row) => row.eventName))];
  const runBulk = (action: 'resend' | 'discard') => {
    if (!selected.length) return;
    const label = action === 'resend' ? 'resend' : 'permanently discard';
    if (
      confirm(
        `${label.charAt(0).toUpperCase()}${label.slice(1)} ${selected.length} selected outbox row(s)?\n\nThis action is audited.`,
      )
    ) {
      bulk.mutate({ action, ids: selected }, { onSuccess: () => setSelected([]) });
    }
  };

  return (
    <>
      {!embedded && (
        <PageHeader
          title="Dead-letter notifications"
          description="Outbox rows that have exhausted all retry attempts. Resend to re-queue them for immediate delivery."
          actions={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              <RefreshCcw className="mr-1.5 h-4 w-4" />
              Refresh
            </Button>
          }
        />
      )}

      {error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Failed to load outbox: {(error as Error).message}
          </CardContent>
        </Card>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={event} onValueChange={setEvent}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Filter by event" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {eventNames.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          Retries reset the outbox attempt counter and queue delivery again immediately.
        </p>
      </div>
      <div className="mb-4 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!selected.length || bulk.isPending}
          onClick={() => runBulk('resend')}
        >
          <RotateCcw className="mr-1.5 h-4 w-4" />
          Resend selected ({selected.length})
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:bg-destructive/10"
          disabled={!selected.length || bulk.isPending}
          onClick={() => runBulk('discard')}
        >
          <Trash2 className="mr-1.5 h-4 w-4" />
          Discard selected
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    aria-label="Select all notification outbox rows"
                    type="checkbox"
                    checked={rows.length > 0 && selected.length === rows.length}
                    onChange={() =>
                      setSelected(selected.length === rows.length ? [] : rows.map((row) => row.id))
                    }
                  />
                </TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Last error</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-24" />
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
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      icon={Bell}
                      title="No dead-letter notifications"
                      description="All outbox rows are within their retry budget."
                      bordered={false}
                    />
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <input
                      aria-label={`Select outbox row ${row.id}`}
                      type="checkbox"
                      checked={selected.includes(row.id)}
                      onChange={() =>
                        setSelected((current) =>
                          current.includes(row.id)
                            ? current.filter((id) => id !== row.id)
                            : [...current, row.id],
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {row.eventName}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm font-medium text-destructive">
                    {row.attempts}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                    {row.lastError ?? '–'}
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(row.createdAt)}</TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={resend.isPending || discard.isPending}
                      onClick={() =>
                        confirm(
                          `Resend ${row.eventName}? This resets its retry counter and is audited.`,
                        ) && resend.mutate(row.id)
                      }
                    >
                      Resend
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-1 text-destructive hover:bg-destructive/10"
                      disabled={resend.isPending || discard.isPending}
                      onClick={() =>
                        confirm(
                          `Discard ${row.eventName}? This permanently removes it and is audited.`,
                        ) && discard.mutate(row.id)
                      }
                    >
                      Discard
                    </Button>
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
