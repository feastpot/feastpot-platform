'use client';

import { cn } from '@feastpot/ui';
import {
  AlertCircle,
  Bell,
  CheckCheck,
  ChevronRight,
  CreditCard,
  MessageSquare,
  ShieldCheck,
  ShoppingBag,
  Star,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { useToast } from '@/components/ui/toaster';
import {
  useInboxList,
  useInboxUnreadCount,
  useMarkAllInboxRead,
  useMarkInboxRead,
  type InboxNotification,
} from '@/hooks/use-inbox';

/**
 * Inbox screen — redesigned to match the Vendor7 mockup.
 *
 * Preserved verbatim:
 *   - useInboxList / useMarkInboxRead / useMarkAllInboxRead hooks
 *   - unreadOnly filter, link-aware row (Link when notif.link, plain
 *     button otherwise), mark-as-read on click
 *   - toast on mark-all (success + error)
 *
 * Layout (desktop):
 *   ┌──────────────────────────────────────┬──────────────────────┐
 *   │ Header: title + Mark all read CTA    │                      │
 *   │ Tab pills: All / Unread (count)      │   Aside:             │
 *   ├──────────────────────────────────────┤   "You're all        │
 *   │ Notification cards                   │    caught up"        │
 *   │  • left tone bar + icon tile         │                      │
 *   │  • title + body + type pill          │                      │
 *   │  • timestamp + unread dot + chevron  │                      │
 *   └──────────────────────────────────────┴──────────────────────┘
 *
 * The aside renders whenever the list isn't empty — when the list IS
 * empty, the same "all caught up" copy is shown inline as the empty
 * state so it doesn't read as orphaned UI.
 */
export function NotificationsClient() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, isLoading, error } = useInboxList({ unreadOnly });
  // Reuse the existing lightweight /inbox/unread-count endpoint
  // (also used by the top-nav badge) so we don't have to refetch the
  // full All-list just to drive the Unread tab badge + the "Mark all
  // read" disabled state.
  const unread = useInboxUnreadCount();
  const markOne = useMarkInboxRead();
  const markAll = useMarkAllInboxRead();
  const { toast } = useToast();

  const items = data?.data ?? [];
  const unreadCount = unread.data?.count ?? 0;

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
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-dark">Notifications</h1>
          <p className="mt-1 text-sm text-mid">
            Order, payout, compliance and review alerts. New rows appear here automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={onMarkAll}
          disabled={markAll.isPending || unreadCount === 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-dark transition-colors hover:bg-surface disabled:opacity-60"
        >
          <CheckCheck className="h-3.5 w-3.5" aria-hidden />
          {markAll.isPending ? 'Marking…' : 'Mark all read'}
        </button>
      </header>

      <div className="flex gap-1.5 text-xs">
        <TabPill active={!unreadOnly} onClick={() => setUnreadOnly(false)}>
          All
        </TabPill>
        <TabPill active={unreadOnly} onClick={() => setUnreadOnly(true)}>
          Unread
          {unreadCount > 0 && (
            <span
              className={cn(
                'ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums',
                unreadOnly ? 'bg-white text-vendor-dark' : 'bg-vendor text-white',
              )}
            >
              {unreadCount}
            </span>
          )}
        </TabPill>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
        <div className="min-w-0">
          {isLoading && (
            <div className="fp-card border border-border bg-white p-6 text-sm text-mid">
              Loading notifications…
            </div>
          )}
          {error && (
            <div className="fp-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Could not load notifications.
            </div>
          )}

          {data && items.length === 0 && <EmptyTile inline />}

          {data && items.length > 0 && (
            <ul className="space-y-3">
              {items.map((n) => (
                <li key={n.id}>
                  <NotificationCard
                    notif={n}
                    onMarkRead={() => {
                      if (!n.readAt) markOne.mutate(n.id);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Aside: same copy as the empty state, kept visible alongside
            the list so the page never feels lopsided when there are
            only a few rows. Hidden on small screens to keep the inbox
            single-column. */}
        {data && items.length > 0 && (
          <aside className="hidden lg:block">
            <EmptyTile />
          </aside>
        )}
      </div>
    </div>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────

function TabPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold transition-colors',
        active
          ? 'bg-vendor text-white shadow-sm'
          : 'bg-white text-dark border border-border hover:bg-surface',
      )}
    >
      {children}
    </button>
  );
}

// ── Empty / "caught up" tile ──────────────────────────────────────

function EmptyTile({ inline = false }: { inline?: boolean }) {
  return (
    <div
      className={cn(
        'fp-card border border-border bg-white text-center',
        inline ? 'px-6 py-12' : 'sticky top-6 px-6 py-10',
      )}
    >
      <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-teal-light">
        <Bell className="h-9 w-9 text-teal" aria-hidden />
      </div>
      <p className="mt-4 text-base font-bold text-dark">You&apos;re all caught up</p>
      <p className="mt-1 text-sm text-mid">
        We&apos;ll let you know when there&apos;s something new.
      </p>
    </div>
  );
}

// ── Notification card ─────────────────────────────────────────────

interface TypeMeta {
  Icon: typeof Bell;
  pill: string;
  bar: string;
  tile: string;
  iconFg: string;
  badge: string;
}

/**
 * Map a backend notification `type` string to its visual treatment.
 * Backend types we care about (per the API spec): `order_*`,
 * `payout_*`, `compliance_doc_verified`, `compliance_*` (reminders
 * + required), `review_*`, `support_*`. Everything else falls back
 * to a neutral bell tile.
 */
function metaForType(type: string): TypeMeta {
  if (type.startsWith('order_')) {
    return {
      Icon: ShoppingBag,
      pill: 'New',
      bar: 'bg-teal',
      tile: 'bg-teal-light',
      iconFg: 'text-teal-dark',
      badge: 'bg-teal-light text-teal-dark',
    };
  }
  if (type.startsWith('payout_')) {
    return {
      Icon: CreditCard,
      pill: 'Payout',
      bar: 'bg-teal',
      tile: 'bg-teal-light',
      iconFg: 'text-teal-dark',
      badge: 'bg-teal-light text-teal-dark',
    };
  }
  if (type === 'compliance_doc_verified' || type === 'compliance_verified') {
    return {
      Icon: ShieldCheck,
      pill: 'Compliance',
      bar: 'bg-teal',
      tile: 'bg-teal-light',
      iconFg: 'text-teal-dark',
      badge: 'bg-teal-light text-teal-dark',
    };
  }
  if (type.startsWith('compliance_')) {
    return {
      Icon: AlertCircle,
      pill: 'Action required',
      bar: 'bg-amber-500',
      tile: 'bg-amber-100',
      iconFg: 'text-amber-600',
      badge: 'bg-amber-100 text-amber-700',
    };
  }
  if (type.startsWith('review_')) {
    return {
      Icon: Star,
      pill: 'Review',
      bar: 'bg-vendor',
      tile: 'bg-vendor-light',
      iconFg: 'text-vendor-dark',
      badge: 'bg-vendor-light text-vendor-dark',
    };
  }
  if (type.startsWith('support_')) {
    return {
      Icon: MessageSquare,
      pill: 'Support',
      bar: 'bg-vendor',
      tile: 'bg-vendor-light',
      iconFg: 'text-vendor-dark',
      badge: 'bg-vendor-light text-vendor-dark',
    };
  }
  return {
    Icon: Bell,
    pill: 'Update',
    bar: 'bg-border',
    tile: 'bg-surface',
    iconFg: 'text-mid',
    badge: 'bg-surface text-mid border border-border',
  };
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * `metadata.ref` is the convention the backend uses for "show this
 * human-readable ID next to the title" (e.g. `#ORD-10245`). We
 * surface it inline when present — the title alone often doesn't
 * carry enough context for a vendor scanning a busy inbox.
 */
function refOf(notif: InboxNotification): string | null {
  const meta = notif.metadata;
  if (!meta) return null;
  const candidate = (meta as { ref?: unknown }).ref;
  return typeof candidate === 'string' ? candidate : null;
}

function NotificationCard({
  notif,
  onMarkRead,
}: {
  notif: InboxNotification;
  onMarkRead: () => void;
}) {
  const meta = metaForType(notif.type);
  const { Icon } = meta;
  const isUnread = !notif.readAt;
  const ref = refOf(notif);

  const body = (
    <div className="flex items-start gap-3">
      <span aria-hidden className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-xl', meta.tile)}>
        <Icon className={cn('h-5 w-5', meta.iconFg)} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="truncate text-sm font-bold text-dark">{notif.title}</p>
          {ref && <span className="text-xs text-mid">· {ref}</span>}
        </div>
        <p className="mt-0.5 line-clamp-2 text-sm text-mid">{notif.body}</p>
        <span
          className={cn(
            'mt-2 inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold',
            meta.badge,
          )}
        >
          {meta.pill}
        </span>
      </div>

      <div className="flex flex-col items-end gap-2 self-stretch">
        <span className="whitespace-nowrap text-xs text-mid">{formatRelative(notif.createdAt)}</span>
        <span
          aria-hidden
          className={cn(
            'h-2 w-2 rounded-full',
            isUnread ? 'bg-teal' : 'border border-border bg-transparent',
          )}
        />
        <ChevronRight className="mt-auto h-4 w-4 text-mid" aria-hidden />
      </div>
    </div>
  );

  const wrapClass = cn(
    'fp-card relative overflow-hidden border border-border bg-white transition-colors hover:bg-surface',
  );
  const inner = <div className="p-4 pl-5">{body}</div>;

  return (
    <article className={wrapClass}>
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', meta.bar)} />
      {notif.link ? (
        <Link href={notif.link} onClick={onMarkRead} className="block focus:outline-none">
          {inner}
        </Link>
      ) : (
        <button type="button" onClick={onMarkRead} className="block w-full text-left focus:outline-none">
          {inner}
        </button>
      )}
    </article>
  );
}
