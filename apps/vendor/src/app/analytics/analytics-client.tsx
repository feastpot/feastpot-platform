'use client';

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

import { StatCard } from '@/components/dashboard/stat-card';
import { useAnalytics } from '@/hooks/use-analytics';
import { formatPence } from '@/lib/format';

// Recharts can't read CSS vars at draw time — keep these as literals.
const BRAND_ORANGE = '#E8520A';
const VENDOR_BLUE = '#185FA5';
const GRID_GREY = '#F0EDE8';

/**
 * Vendor analytics. Data fetching unchanged — visual wrapper migrated
 * to the SideNav shell + fp-card + tone tokens to match the rest of
 * the redesigned vendor portal.
 */
export function AnalyticsClient() {
  const { data, isLoading, error } = useAnalytics();

  const weekly = useMemo(() => data?.weeklyRevenue ?? [], [data?.weeklyRevenue]);
  const hourly = data?.hourlyDistribution ?? [];
  const top = data?.topDishes ?? [];

  const { revenueDelta, ordersDelta, thisWeek } = useMemo(() => {
    if (weekly.length < 2)
      return { revenueDelta: undefined, ordersDelta: undefined, thisWeek: null };
    const t = weekly[weekly.length - 1]!;
    const l = weekly[weekly.length - 2]!;
    return {
      thisWeek: t,
      revenueDelta:
        l.revenuePence === 0
          ? undefined
          : ((t.revenuePence - l.revenuePence) / l.revenuePence) * 100,
      ordersDelta:
        l.ordersCount === 0
          ? undefined
          : ((t.ordersCount - l.ordersCount) / l.ordersCount) * 100,
    };
  }, [weekly]);

  if (error) {
    return (
      <div className="fp-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error instanceof Error ? error.message : 'Could not load analytics.'}
      </div>
    );
  }

  const revenuePounds = thisWeek ? thisWeek.revenuePence / 100 : 0;
  const ordersThisWeek = thisWeek?.ordersCount ?? 0;
  const aov = data?.averageOrderValuePence ?? 0;
  const reorderPct = data?.reorderRatePct ?? 0;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-dark">Analytics</h1>
        <p className="mt-1 text-sm text-mid">
          Last 8 weeks · top dishes from last 90 days
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          iconKey="revenue"
          label="Revenue this week"
          value={Math.round(revenuePounds)}
          prefix="£"
          color="brand"
          change={revenueDelta}
        />
        <StatCard
          iconKey="orders"
          label="Orders this week"
          value={ordersThisWeek}
          color="teal"
          change={ordersDelta}
        />
        <StatCard
          iconKey="revenue"
          label="Avg basket size"
          value={Math.round(aov / 100)}
          prefix="£"
          color="vendor"
        />
        <StatCard
          iconKey="pending"
          label="Return rate"
          value={Math.round(reorderPct)}
          suffix="%"
          color="amber"
        />
      </div>

      <section className="fp-card border border-border bg-white">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-base font-bold text-dark">Weekly revenue (net)</h2>
          <p className="mt-0.5 text-xs text-mid">Net revenue after platform and processing fees.</p>
        </div>
        <div className="h-64 px-3 pb-4 pt-3">
          {isLoading ? (
            <p className="px-2 text-sm text-mid">Loading…</p>
          ) : weekly.length === 0 ? (
            <p className="px-2 text-sm text-mid">No revenue yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={weekly.map((w) => ({
                  name: weekLabel(w.weekStart),
                  revenue: w.revenuePence / 100,
                }))}
                margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_GREY} vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: '#5F5E5A' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#5F5E5A' }}
                  tickFormatter={(v: number) => `£${v}`}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(232,82,10,0.08)' }}
                  contentStyle={{
                    background: '#fff',
                    border: '1px solid #E5E5E0',
                    borderRadius: 12,
                    boxShadow: '0 4px 16px rgba(28,28,26,0.08)',
                    fontSize: 12,
                  }}
                  labelStyle={{ color: '#1C1C1A', fontWeight: 600 }}
                  formatter={(v: number) => [`£${v.toFixed(2)}`, 'Revenue']}
                />
                <Bar dataKey="revenue" fill={BRAND_ORANGE} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="fp-card border border-border bg-white">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-base font-bold text-dark">Hourly order distribution</h2>
          <p className="mt-0.5 text-xs text-mid">UTC, last 90 days.</p>
        </div>
        <div className="h-56 px-3 pb-4 pt-3">
          {isLoading ? (
            <p className="px-2 text-sm text-mid">Loading…</p>
          ) : hourly.length === 0 ? (
            <p className="px-2 text-sm text-mid">No orders to chart yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={hourly.map((h) => ({ name: `${h.hour}:00`, orders: h.ordersCount }))}
                margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_GREY} vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#5F5E5A' }}
                  interval={2}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#5F5E5A' }}
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: '#fff',
                    border: '1px solid #E5E5E0',
                    borderRadius: 12,
                    boxShadow: '0 4px 16px rgba(28,28,26,0.08)',
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="orders"
                  stroke={VENDOR_BLUE}
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="fp-card border border-border bg-white">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-base font-bold text-dark">Top dishes by revenue</h2>
          <p className="mt-0.5 text-xs text-mid">Your best sellers over the last 90 days.</p>
        </div>
        {isLoading ? (
          <p className="px-5 py-8 text-center text-sm text-mid">Loading…</p>
        ) : top.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-mid">Not enough data yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface text-left text-[11px] uppercase tracking-wide text-mid">
                <th className="px-5 py-2 font-semibold">#</th>
                <th className="px-3 py-2 font-semibold">Dish</th>
                <th className="px-3 py-2 text-right font-semibold">Orders</th>
                <th className="px-5 py-2 text-right font-semibold">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {top.map((d, idx) => (
                <tr key={d.menuItemId} className="bg-white">
                  <td className="px-5 py-3 font-bold tabular-nums text-dark">{idx + 1}</td>
                  <td className="px-3 py-3 text-dark">{d.name}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-mid">{d.ordersCount}</td>
                  <td className="px-5 py-3 text-right font-bold tabular-nums text-brand">
                    {formatPence(d.revenuePence)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function weekLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { weekday: 'short' });
}
