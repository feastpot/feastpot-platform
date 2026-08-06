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
import { Bell, RefreshCcw } from 'lucide-react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { useDeadLetterOutbox, useResendOutboxRow } from '@/hooks/use-notification-outbox';
import { formatDate } from '@/lib/format';

export function NotificationsClient() {
  const { data, isLoading, error, refetch } = useDeadLetterOutbox();
  const resend = useResendOutboxRow();

  const rows = data?.data ?? [];

  return (
    <>
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

      {error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Failed to load outbox: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
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
                  <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="p-0">
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
                    <Badge variant="outline" className="font-mono text-xs">
                      {row.eventName}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm font-medium text-destructive">
                    {row.attempts}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                    {row.lastError ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(row.createdAt)}</TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={resend.isPending}
                      onClick={() => resend.mutate(row.id)}
                    >
                      Resend
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
