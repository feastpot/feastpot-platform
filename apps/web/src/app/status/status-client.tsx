'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Public status page. Hosted on Vercel (apps/web) precisely so it stays
 * reachable when the API (Replit VM) is down — the checks run client-side
 * from the visitor's browser:
 *
 *  - API: real JSON fetch of /v1/healthz (its origin allow-list includes
 *    status.feastpot.co.uk and feastpot.co.uk).
 *  - Web / vendor / admin: `no-cors` pings — the response is opaque, but a
 *    resolved fetch means the host is reachable and serving.
 */

const API_HEALTHZ = 'https://api.feastpot.co.uk/v1/healthz';

type ComponentState = 'operational' | 'degraded' | 'down' | 'checking';

interface ComponentStatus {
  id: string;
  label: string;
  state: ComponentState;
  detail?: string;
}

interface HealthzQueues {
  [name: string]: { waiting: number; active: number; failed: number };
}

interface HealthzResponse {
  status: string;
  checks?: {
    database?: string;
    redis?: string;
    queues?: HealthzQueues;
    stripe?: string;
    notifications?: { email?: string; whatsapp?: string };
  };
}

async function pingOpaque(url: string): Promise<boolean> {
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    return true;
  } catch {
    return false;
  }
}

async function checkApi(): Promise<ComponentStatus[]> {
  try {
    const res = await fetch(API_HEALTHZ, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return [{ id: 'api', label: 'Ordering API', state: 'down', detail: `HTTP ${res.status}` }];
    }
    const body = (await res.json()) as HealthzResponse;
    const checks = body.checks ?? {};
    const queues = checks.queues ?? {};
    const failedJobs = Object.values(queues).reduce((sum, q) => sum + (q.failed ?? 0), 0);

    const apiState: ComponentState =
      body.status === 'ok' ? 'operational' : body.status === 'degraded' ? 'degraded' : 'down';

    return [
      { id: 'api', label: 'Ordering API', state: apiState },
      {
        id: 'database',
        label: 'Database',
        state: checks.database === 'ok' ? 'operational' : 'down',
      },
      {
        id: 'queues',
        label: 'Background processing',
        state: checks.redis === 'ok' ? (failedJobs > 0 ? 'degraded' : 'operational') : 'down',
        detail: failedJobs > 0 ? `${failedJobs} failed job(s)` : undefined,
      },
      {
        id: 'payments',
        label: 'Payments (Stripe)',
        state: checks.stripe === 'live' || checks.stripe === 'test' ? 'operational' : 'down',
      },
      {
        id: 'notifications',
        label: 'Notifications',
        state: checks.notifications?.email === 'configured' ? 'operational' : ('degraded' as const),
      },
    ];
  } catch {
    return [{ id: 'api', label: 'Ordering API', state: 'down', detail: 'Unreachable' }];
  }
}

const STATE_META: Record<ComponentState, { label: string; dot: string; text: string }> = {
  operational: { label: 'Operational', dot: 'bg-green-500', text: 'text-green-700' },
  degraded: { label: 'Degraded', dot: 'bg-amber-500', text: 'text-amber-700' },
  down: { label: 'Down', dot: 'bg-red-500', text: 'text-red-700' },
  checking: { label: 'Checking…', dot: 'bg-gray-300 animate-pulse', text: 'text-gray-500' },
};

const INITIAL: ComponentStatus[] = [
  { id: 'web', label: 'Customer website', state: 'checking' },
  { id: 'api', label: 'Ordering API', state: 'checking' },
  { id: 'vendor', label: 'Vendor portal', state: 'checking' },
  { id: 'admin', label: 'Admin portal', state: 'checking' },
];

export function StatusClient() {
  const [components, setComponents] = useState<ComponentStatus[]>(INITIAL);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const runChecks = useCallback(async () => {
    const [apiComponents, webUp, vendorUp, adminUp] = await Promise.all([
      checkApi(),
      pingOpaque('https://www.feastpot.co.uk/'),
      pingOpaque('https://vendor.feastpot.co.uk/'),
      pingOpaque('https://admin.feastpot.co.uk/'),
    ]);
    const site = (id: string, label: string, up: boolean): ComponentStatus => ({
      id,
      label,
      state: up ? 'operational' : 'down',
    });
    setComponents([
      site('web', 'Customer website', webUp),
      ...apiComponents,
      site('vendor', 'Vendor portal', vendorUp),
      site('admin', 'Admin portal', adminUp),
    ]);
    setCheckedAt(new Date());
  }, []);

  useEffect(() => {
    void runChecks();
    const interval = setInterval(() => void runChecks(), 60_000);
    return () => clearInterval(interval);
  }, [runChecks]);

  const anyDown = components.some((c) => c.state === 'down');
  const anyDegraded = components.some((c) => c.state === 'degraded');
  const checking = components.some((c) => c.state === 'checking');
  const overall = checking
    ? STATE_META.checking
    : anyDown
      ? { ...STATE_META.down, label: 'Some systems are down' }
      : anyDegraded
        ? { ...STATE_META.degraded, label: 'Degraded performance' }
        : { ...STATE_META.operational, label: 'All systems operational' };

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="font-serif text-3xl font-bold text-foreground">Feastpot status</h1>

      <div className="mt-8 flex items-center gap-3 rounded-xl border border-border bg-white p-5 shadow-sm">
        <span className={`h-3.5 w-3.5 rounded-full ${overall.dot}`} aria-hidden />
        <span className={`text-lg font-semibold ${overall.text}`}>{overall.label}</span>
      </div>

      <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-white shadow-sm">
        {components.map((c) => {
          const meta = STATE_META[c.state];
          return (
            <li key={c.id} className="flex items-center justify-between p-4">
              <span className="font-medium text-foreground">{c.label}</span>
              <span className="flex items-center gap-2 text-sm">
                {c.detail && <span className="text-gray-500">{c.detail}</span>}
                <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} aria-hidden />
                <span className={meta.text}>{meta.label}</span>
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-sm text-gray-500">
        {checkedAt
          ? `Last checked ${checkedAt.toLocaleTimeString('en-GB')} — refreshes every minute.`
          : 'Running checks…'}{' '}
        Checks run from your browser, so this page works even during an outage.
      </p>
      <p className="mt-2 text-sm text-gray-500">
        Problems ordering? Contact{' '}
        <a className="underline" href="mailto:support@feastpot.co.uk">
          support@feastpot.co.uk
        </a>
        .
      </p>
    </div>
  );
}
