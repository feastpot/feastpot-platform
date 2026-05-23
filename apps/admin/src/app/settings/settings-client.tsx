'use client';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@feastpot/ui';
import {
  Bell,
  ClipboardList,
  CreditCard,
  ExternalLink,
  ListTree,
  Megaphone,
  PiggyBank,
  Settings as SettingsIcon,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toaster';
import { apiRequest } from '@/lib/api/client';
import type { StaffRole, StaffUser } from '@/lib/auth/server-gate';
import { API_URL } from '@/lib/env';

interface SettingsClientProps {
  user: StaffUser;
}

const ROLE_TONE: Record<StaffRole, StatusTone> = {
  admin: 'brand',
  support: 'info',
  finance: 'success',
  compliance: 'warning',
};

const ROLE_DESCRIPTIONS: Record<StaffRole, { summary: string; canDo: string[] }> = {
  admin: {
    summary: 'Full control. Use sparingly.',
    canDo: [
      'Approve, suspend, or remove vendors',
      'Override any order status or trigger refunds',
      'Issue platform credit and run payout batches',
      'Mint discount codes and broadcast push notifications',
    ],
  },
  support: {
    summary: 'Front-line customer & vendor help.',
    canDo: [
      'Search users and override order statuses',
      'Read disputes, audit log, and reviews queue',
      'Cannot trigger refunds or change vendor lifecycle',
    ],
  },
  finance: {
    summary: 'Money in, money out.',
    canDo: [
      'Approve/hold payouts and reconcile Stripe',
      'Trigger refunds and issue credit',
      'View discount codes (read-only)',
    ],
  },
  compliance: {
    summary: 'KYC & document review.',
    canDo: [
      'Verify or reject vendor documents',
      'Suspend live vendors for compliance issues',
      'Export user DSARs',
    ],
  },
};

export function SettingsClient({ user }: SettingsClientProps) {
  const { toast } = useToast();
  const [isRunningBatch, setIsRunningBatch] = useState(false);

  const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
  const initials =
    `${(user.firstName ?? user.email)[0] ?? '?'}${user.lastName?.[0] ?? ''}`.toUpperCase();

  async function runPayoutBatch() {
    const confirmed = window.confirm(
      'This will run the payout batch for all pending orders. ' +
        'Payouts already transferred this week will not be duplicated. Continue?',
    );
    if (!confirmed) return;

    setIsRunningBatch(true);
    try {
      const result = await apiRequest<{ message: string; jobId: string }>(
        '/admin/payouts/run-batch',
        { method: 'POST', accessToken: user.accessToken },
      );
      toast({
        title: 'Payout batch queued',
        description: `${result.message} (job ${result.jobId})`,
      });
    } catch (err) {
      toast({
        title: 'Failed to queue payout batch',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setTimeout(() => setIsRunningBatch(false), 5000);
    }
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Platform-wide configuration, defaults, and operational tools."
      />

      <div className="space-y-6">
        {/* ─── My account ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCog className="h-4 w-4 text-primary" />
              My account
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-start gap-4">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-teal-light text-lg font-bold text-teal-dark">
                {initials}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{fullName}</h2>
                  <StatusPill tone={ROLE_TONE[user.role]}>{user.role}</StatusPill>
                </div>
                <div className="text-sm text-muted-foreground">{user.email}</div>
                <div className="font-mono text-xs text-muted-foreground">ID {user.id}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ─── Platform defaults (read-only) ──────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <SettingsIcon className="h-4 w-4 text-primary" />
              Platform defaults
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              These values are baked into the platform. Per-vendor overrides for commission live on each vendor's profile page.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard
                tone="teal"
                label="Default commission"
                value="12.00%"
                caption="Applied to new vendors on signup"
              />
              <StatCard
                tone="blue"
                label="Payout cadence"
                value="Weekly"
                caption="Mondays at 02:00 UTC"
              />
              <StatCard
                tone="neutral"
                label="Base currency"
                value="GBP (£)"
                caption="All amounts stored in pence"
              />
            </div>
            <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              Editing these defaults requires a backend release. Open an engineering ticket if a change is needed.
            </div>
          </CardContent>
        </Card>

        {/* ─── Payouts ────────────────────────────────────────────────── */}
        {(user.role === 'admin' || user.role === 'finance') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <PiggyBank className="h-4 w-4 text-primary" />
                Payouts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                The weekly batch runs automatically on Monday at 02:00 UTC. Use the manual trigger only when an out-of-cycle run is required (e.g. catching up after an outage).
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={runPayoutBatch} disabled={isRunningBatch}>
                  {isRunningBatch ? 'Queuing…' : 'Run payout batch now'}
                </Button>
                <Link
                  href="/payouts"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  <CreditCard className="h-4 w-4" />
                  Open payouts dashboard
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── Communications ─────────────────────────────────────────── */}
        {user.role === 'admin' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Megaphone className="h-4 w-4 text-primary" />
                Communications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Send one-shot web-push broadcasts to customers, vendors, or both audiences.
              </p>
              <Link
                href="/push/compose"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                <Bell className="h-4 w-4" />
                Compose a push broadcast
              </Link>
            </CardContent>
          </Card>
        )}

        {/* ─── Operations ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Operations &amp; audit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              <li className="flex items-center justify-between gap-3 py-3">
                <div>
                  <div className="font-medium">Audit log</div>
                  <div className="text-xs text-muted-foreground">
                    Every privileged action with actor, target, and reason.
                  </div>
                </div>
                <Link
                  href="/audit-log"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  <ClipboardList className="h-4 w-4" />
                  Open
                </Link>
              </li>
              <li className="flex items-center justify-between gap-3 py-3">
                <div>
                  <div className="font-medium">Job queues</div>
                  <div className="text-xs text-muted-foreground">
                    BullMQ dashboard for background workers (push, payouts, notifications).
                  </div>
                </div>
                <a
                  href={`${API_URL}/admin/queues`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  <ListTree className="h-4 w-4" />
                  Open
                  <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* ─── Staff & roles ──────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              Staff &amp; roles
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Staff are regular users promoted to one of four roles. Promoting a customer to a staff role is currently a database operation. Contact engineering with the user's email to request a role change.
            </p>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {(Object.keys(ROLE_DESCRIPTIONS) as StaffRole[]).map((role) => {
                const meta = ROLE_DESCRIPTIONS[role];
                return (
                  <div
                    key={role}
                    className="rounded-lg border border-border bg-card p-4"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <StatusPill tone={ROLE_TONE[role]}>{role}</StatusPill>
                      <span className="text-sm text-muted-foreground">{meta.summary}</span>
                    </div>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {meta.canDo.map((line) => (
                        <li key={line} className="flex gap-2">
                          <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary" />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href="/users"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                <Users className="h-4 w-4" />
                Look up a user
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
