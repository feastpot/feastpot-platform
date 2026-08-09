'use client';

import { AlertTriangle, CheckCircle2, Clock, FileText, Gavel, Scale, ShieldAlert } from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle } from '@feastpot/ui';

import { useAdminLegalAlerts } from '@/hooks/use-legal';
import { formatDateTime } from '@/lib/format';

function AlertBadge({ count, label, href }: { count: number; label: string; href: string }) {
  if (count === 0) return null;
  return (
    <Link href={href}>
      <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-red-50 px-3 py-2 text-sm font-medium text-destructive hover:bg-red-100">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        {count} {label}
      </div>
    </Link>
  );
}

const NAV_SECTIONS = [
  {
    href: '/legal/documents',
    icon: FileText,
    label: 'Documents',
    description: 'All versions, publish flow, solicitor sign-off gate, 15-day rule',
  },
  {
    href: '/legal/coverage',
    icon: CheckCircle2,
    label: 'Acceptance coverage',
    description: 'Percentage of active vendors on the current live version',
  },
  {
    href: '/legal/notices',
    icon: Clock,
    label: 'Notice delivery',
    description: 'Sent, delivered, opened, acknowledged - flag bounced notices',
  },
  {
    href: '/legal/enforcement',
    icon: ShieldAlert,
    label: 'Enforcement log',
    description: 'All restrictions, suspensions and terminations with notice timing analysis',
  },
  {
    href: '/legal/appeals',
    icon: Gavel,
    label: 'Appeals queue',
    description: 'Open appeals with deadlines and different-reviewer rule',
  },
  {
    href: '/legal/evidence',
    icon: Scale,
    label: 'Evidence export',
    description: 'Generate a verifiable bundle for a vendor - acceptances, notices, actions',
  },
];

export function LegalDashboardClient() {
  const { data: alerts, isLoading } = useAdminLegalAlerts();

  const coverageOk = !alerts || alerts.coverageGap.count === 0;
  const coveragePct = alerts?.coverageGap.coveragePct ?? 100;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Legal operations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Compliance with P2B Regulation, SI 2023/817, and the Feastpot vendor terms.
        </p>
      </div>

      {/* Coverage headline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Terms acceptance coverage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div
              className={`text-5xl font-bold tabular-nums ${
                coveragePct === 100
                  ? 'text-green-600'
                  : coveragePct >= 95
                    ? 'text-amber-500'
                    : 'text-destructive'
              }`}
            >
              {isLoading ? '-' : `${coveragePct}%`}
            </div>
            <div className="mb-1 text-sm text-muted-foreground">
              {isLoading
                ? 'Loading...'
                : alerts
                  ? `${alerts.coverageGap.count === 0 ? 'All' : `${alerts.coverageGap.count} vendor${alerts.coverageGap.count === 1 ? '' : 's'} not on`} the current live version${alerts.coverageGap.liveVersion ? ` (v${alerts.coverageGap.liveVersion.version})` : ''}`
                  : ''}
            </div>
          </div>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${
                coveragePct === 100
                  ? 'bg-green-500'
                  : coveragePct >= 95
                    ? 'bg-amber-400'
                    : 'bg-destructive'
              }`}
              style={{ width: `${coveragePct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            This number should be 100. Any drop should be visible immediately.
          </p>
        </CardContent>
      </Card>

      {/* Active alerts */}
      {!isLoading && alerts && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-foreground">Active alerts</h2>
          <div className="flex flex-wrap gap-2">
            {coverageOk ? (
              <div className="flex items-center gap-1.5 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" aria-hidden /> All vendors on current terms
              </div>
            ) : (
              <AlertBadge
                count={alerts.coverageGap.count}
                label="vendors not on current version"
                href="/legal/coverage?onlyBehind=true"
              />
            )}
            <AlertBadge
              count={alerts.bouncedNotices.count}
              label="bounced notices"
              href="/legal/notices"
            />
            <AlertBadge
              count={alerts.lateEnforcementNotices.count}
              label="enforcement actions with late notice"
              href="/legal/enforcement"
            />
            <AlertBadge
              count={alerts.urgentAppeals.count}
              label={`appeal${alerts.urgentAppeals.count === 1 ? '' : 's'} approaching deadline`}
              href="/legal/appeals"
            />
          </div>

          {alerts.lateEnforcementNotices.sample.length > 0 && (
            <div className="mt-3 rounded-md border border-destructive/30 bg-red-50 p-3 text-sm">
              <p className="font-semibold text-destructive">
                Notice timing failures (P2B clause 14.1)
              </p>
              <p className="mt-0.5 text-xs text-red-700">
                These enforcement actions have notice dates after their effective dates, with no
                urgent basis recorded. This is the compliance failure mode to catch.
              </p>
              <ul className="mt-2 space-y-1 text-xs text-red-800">
                {alerts.lateEnforcementNotices.sample.map((a) => (
                  <li key={a.id}>
                    <strong>{a.vendor.businessName}</strong> - {a.actionType} effective{' '}
                    {formatDateTime(a.effectiveAt)}, notice sent {formatDateTime(a.noticeSentAt)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Nav cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {NAV_SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.href} href={s.href} className="group">
              <Card className="h-full transition-shadow group-hover:shadow-md">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" aria-hidden />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{s.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
