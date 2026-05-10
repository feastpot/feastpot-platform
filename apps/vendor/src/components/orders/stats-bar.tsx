'use client';

import { Card, CardContent, Skeleton } from '@feastpot/ui';

import { useVendorStats } from '@/hooks/use-vendor-stats';

function pounds(pence: number): string {
  return (pence / 100).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' });
}

export function StatsBar() {
  const { data, isLoading, isError } = useVendorStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">
          Stats unavailable right now.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <StatCard label="Today" value={`${data.today.orders} orders`} sub={pounds(data.today.revenuePence)} />
      <StatCard label="This week" value={`${data.week.orders} orders`} sub={pounds(data.week.revenuePence)} />
      <StatCard
        label="Pending right now"
        value={String(data.pendingNow)}
        sub={data.pendingNow > 0 ? 'Needs your attention' : 'All caught up'}
        pulse={data.pendingNow > 0}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  pulse,
}: {
  label: string;
  value: string;
  sub: string;
  pulse?: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          {pulse && <span className="h-2 w-2 rounded-full bg-brand animate-pulse-dot" />}
          {label}
        </div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
        <div className="text-sm text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}
