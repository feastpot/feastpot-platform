'use client';

import { Button, Card, CardContent } from '@feastpot/ui';
import { Bell, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { useToast } from '@/components/ui/toaster';
import { useInboxList, useMarkAllInboxRead, useMarkInboxRead } from '@/hooks/use-inbox';

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function NotificationsClient() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, isLoading, error } = useInboxList({ unreadOnly });
  const markOne = useMarkInboxRead();
  const markAll = useMarkAllInboxRead();
  const { toast } = useToast();

  async function onMarkAll() {
    try {
      const res = await markAll.mutateAsync();
      toast({
        title: res.updated > 0 ? `Marked ${res.updated} as read` : 'No unread notifications',
      });
    } catch (err) {
      toast({
        title: 'Could not mark all as read',
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      });
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Order, payout, compliance and review alerts. New rows appear here automatically.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onMarkAll} disabled={markAll.isPending} className="gap-1">
          <CheckCheck className="h-4 w-4" />
          {markAll.isPending ? 'Marking…' : 'Mark all read'}
        </Button>
      </div>

      <div className="flex gap-1 text-xs">
        <button
          type="button"
          onClick={() => setUnreadOnly(false)}
          className={
            'rounded-full px-3 py-1 font-medium ' +
            (!unreadOnly ? 'bg-vendor text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80')
          }
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setUnreadOnly(true)}
          className={
            'rounded-full px-3 py-1 font-medium ' +
            (unreadOnly ? 'bg-vendor text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80')
          }
        >
          Unread
        </button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading notifications…</p>}
      {error && <p className="text-sm text-destructive">Could not load notifications.</p>}

      {data && data.data.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Bell className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">You're all caught up</p>
            <p className="text-sm text-muted-foreground">
              We'll let you know when there's something new.
            </p>
          </CardContent>
        </Card>
      )}

      {data && data.data.length > 0 && (
        <ul className="space-y-2">
          {data.data.map((n) => {
            const isUnread = !n.readAt;
            const body = (
              <div className="flex items-start gap-3">
                <div
                  className={
                    'mt-1 h-2 w-2 shrink-0 rounded-full ' +
                    (isUnread ? 'bg-brand' : 'bg-transparent ring-1 ring-muted-foreground/30')
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className={'truncate ' + (isUnread ? 'font-semibold' : 'font-medium text-muted-foreground')}>
                      {n.title}
                    </p>
                    <span className="text-xs text-muted-foreground">{formatRelative(n.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{n.body}</p>
                </div>
              </div>
            );
            return (
              <li key={n.id}>
                <Card className={isUnread ? 'border-vendor/30 bg-vendor-light/30' : undefined}>
                  <CardContent className="p-3">
                    {n.link ? (
                      <Link
                        href={n.link}
                        onClick={() => {
                          if (isUnread) markOne.mutate(n.id);
                        }}
                        className="block focus:outline-none"
                      >
                        {body}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="block w-full text-left focus:outline-none"
                        onClick={() => isUnread && markOne.mutate(n.id)}
                      >
                        {body}
                      </button>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
