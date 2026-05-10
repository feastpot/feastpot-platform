'use client';

import {
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@feastpot/ui';
import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useAnalytics } from '@/hooks/use-analytics';
import { formatPence } from '@/lib/format';

// Brand orange from tailwind.config.ts (--brand). Hardcoded so recharts can
// consume a literal color (it doesn't read CSS vars at draw time).
const BRAND_ORANGE = '#E8520A';
const VENDOR_BLUE = '#185FA5';

export function AnalyticsClient() {
  const { data, isLoading, error } = useAnalytics();

  const weekly = data?.weeklyRevenue ?? [];
  const hourly = data?.hourlyDistribution ?? [];
  const top = data?.topDishes ?? [];

  // Compute "this vs last week" deltas from the 8-week series.
  const { revenueDelta, ordersDelta, thisWeek } = useMemo(() => {
    if (weekly.length < 2) return { revenueDelta: null, ordersDelta: null, thisWeek: null };
    const t = weekly[weekly.length - 1]!;
    const l = weekly[weekly.length - 2]!;
    return {
      thisWeek: t,
      revenueDelta: l.revenuePence === 0 ? null : ((t.revenuePence - l.revenuePence) / l.revenuePence) * 100,
      ordersDelta: l.ordersCount === 0 ? null : ((t.ordersCount - l.ordersCount) / l.ordersCount) * 100,
    };
  }, [weekly]);

  if (error) {
    return (
      <Card><CardContent className="p-4 text-sm text-destructive">
        {error instanceof Error ? error.message : 'Could not load analytics'}
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">Last 8 weeks · top dishes from last 90 days</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Revenue this week"
          value={thisWeek ? formatPence(thisWeek.revenuePence) : '—'}
          delta={revenueDelta}
        />
        <Metric
          label="Orders this week"
          value={thisWeek ? thisWeek.ordersCount.toString() : '—'}
          delta={ordersDelta}
        />
        <Metric label="Average order value" value={data ? formatPence(data.averageOrderValuePence) : '—'} />
        <Metric label="Customer return rate" value={data ? `${data.reorderRatePct.toFixed(1)}%` : '—'} />
      </div>

      <Card>
        <CardContent className="p-4">
          <h2 className="mb-3 text-sm font-medium">Weekly revenue (net)</h2>
          <div className="h-64">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekly.map((w) => ({ name: weekLabel(w.weekStart), revenue: w.revenuePence / 100 }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `£${v}`} />
                  <Tooltip formatter={(v: number) => `£${v.toFixed(2)}`} />
                  <Bar dataKey="revenue" fill={BRAND_ORANGE} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h2 className="mb-3 text-sm font-medium">Hourly order distribution (UTC, last 90 days)</h2>
          <div className="h-56">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hourly.map((h) => ({ name: `${h.hour}:00`, orders: h.ordersCount }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={2} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="orders" stroke={VENDOR_BLUE} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h2 className="mb-3 text-sm font-medium">Top dishes by revenue</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!isLoading && top.length === 0 && (
                <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Not enough data yet.</TableCell></TableRow>
              )}
              {top.map((d) => (
                <TableRow key={d.menuItemId}>
                  <TableCell>{d.name}</TableCell>
                  <TableCell className="text-right">{d.ordersCount}</TableCell>
                  <TableCell className="text-right">{d.unitsSold}</TableCell>
                  <TableCell className="text-right font-medium">{formatPence(d.revenuePence)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, delta }: { label: string; value: string; delta?: number | null }) {
  const positive = (delta ?? 0) >= 0;
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
        {delta !== undefined && delta !== null && (
          <p className={`text-xs ${positive ? 'text-teal' : 'text-destructive'}`}>
            {positive ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% vs last week
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function weekLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}
