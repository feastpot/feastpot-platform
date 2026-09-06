'use client';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@feastpot/ui';
import { RefreshCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { apiRequest } from '@/lib/api/client';
import { API_URL } from '@/lib/env';

interface QueueHealth {
  queue: string;
  available: boolean;
  error?: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  oldestWaitingAgeMs: number | null;
}

function age(value: number | null): string {
  if (value === null) return 'Not waiting';
  const seconds = Math.floor(value / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function QueuesClient({ accessToken }: { accessToken: string }) {
  const [health, setHealth] = useState<QueueHealth[]>([]);
  const [boardUrl, setBoardUrl] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [snapshot] = await Promise.all([
        apiRequest<{ data: QueueHealth[] }>('/admin/queues/health', { accessToken }),
        apiRequest<{ expiresInSeconds: number }>('/admin/queues/access', {
          method: 'POST',
          accessToken,
          credentials: 'include',
        }),
      ]);
      setHealth(snapshot.data);
      setBoardUrl(`${API_URL}/admin/queues`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Job queues"
        description="Queue health and controls for background work. Access is limited to your authenticated AAL2 admin session and recorded in the audit log."
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCcw className="mr-1.5 h-4 w-4" />
            Refresh
          </Button>
        }
      />
      {error && (
        <p className="mb-4 text-sm text-destructive">Could not load queue operations: {error}</p>
      )}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Queue health</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Queue</TableHead>
                <TableHead>Waiting</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Delayed</TableHead>
                <TableHead>Failed</TableHead>
                <TableHead>Oldest waiting</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {health.map((queue) => (
                <TableRow key={queue.queue}>
                  <TableCell className="font-mono text-xs">{queue.queue}</TableCell>
                  <TableCell>{queue.available ? queue.waiting : 'Unavailable'}</TableCell>
                  <TableCell>{queue.available ? queue.active : 'Unavailable'}</TableCell>
                  <TableCell>{queue.available ? queue.delayed : 'Unavailable'}</TableCell>
                  <TableCell>{queue.available ? queue.failed : 'Unavailable'}</TableCell>
                  <TableCell>
                    {queue.available
                      ? age(queue.oldestWaitingAgeMs)
                      : (queue.error ?? 'Unavailable')}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && health.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    No registered queues reported.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {boardUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Queue inspector</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Bull Board is read-only. Use the audited retry and discard controls in Dead-letter
              Bull jobs for failed work.
            </p>
            <iframe
              title="Bull Board queue inspector"
              src={boardUrl}
              referrerPolicy="no-referrer"
              className="h-[760px] w-full border-0"
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}
