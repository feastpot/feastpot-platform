'use client';

import { Card, CardContent } from '@feastpot/ui';
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

// Recharts can't read CSS vars at draw time - keep these as literals.
const BRAND_ORANGE = '#E8520A';
const VENDOR_BLUE = '#185FA5';
const GRID_GREY = '#F0EDE8';

/**
 * Vendor analytics. Data fetching is unchanged - only the visual wrapper
 * has been refreshed to match the brief:
 *   - Metric strip uses the shared StatCard so the count-up + colour
 *     treatment matches the dashboard home.
 *   - Bar chart fills with brand orange (revenue is a "money" metric so
 *     orange is appropriate; vendor blue stays for the hourly line which
 *     is a volume/distribution chart).
 *   - Top-dishes table uses zebra-striped rows (white / surface) and a
 *     bold-orange revenue column for scannability.
 */
export function AnalyticsClient() {
  const { data, isLoading, error } = useAnalytics();

  const weekly = data?.weeklyRevenue ?? [];
  const hourly = data?.hourlyDistribution ?? [];
  const top = data?.topDishes ?? [];

  // "This vs last week" deltas drive the StatCard `change` prop.
  const { revenueDelta, ordersDelta, thisWeek } = useMemo(() => {
    if (weekly.length < 2) return { revenueDelta: undefined, ordersDelta: undefined, thisWeek: null };
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
      <Card>
        <CardContent className="p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Could not load analytics'}
        </CardContent>
      </Card>
    );
  }

  const revenuePounds = thisWeek ? thisWeek.revenuePence / 100 : 0;
  const ordersThisWeek = thisWeek?.ordersCount ?? 0;
  const aov = data?.averageOrderValuePence ?? 0;
  const reorderPct = data?.reorderRatePct ?? 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-dark">Analytics</h1>
        <p className="text-sm text-mid">
          Last 8 weeks · top dishes from last 90 days
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon="💰"
          label="Revenue this week"
          value={Math.round(revenuePounds)}
          prefix="£"
          color="brand"
          change={revenueDelta}
        />
        <StatCard
          icon="📦"
          label="Orders this week"
          value={ordersThisWeek}
          color="teal"
          change={ordersDelta}
        />
        <StatCard
          icon="🧾"
          label="Avg basket size"
          value={Math.round(aov / 100)}
          prefix="£"
          color="vendor"
        />
        <StatCard
          icon="🔁"
          label="Return rate"
          // Render the percent as an integer count-up plus the % suffix.
          value={Math.round(reorderPct)}
          suffix="%"
          color="gray"
        />
      </div>

      <Card>
        <CardContent className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-dark">
            Weekly revenue (net)
          </h2>
          <div className="h-64">
            {isLoading ? (
              <p className="text-sm text-mid">Loading…</p>
            ) : weekly.length === 0 ? (
              <p className="text-sm text-mid">No revenue yet.</p>
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
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-dark">
            Hourly order distribution (UTC, last 90 days)
          </h2>
          <div className="h-56">
            {isLoading ? (
              <p className="text-sm text-mid">Loading…</p>
            ) : hourly.length === 0 ? (
              <p className="text-sm text-mid">No orders to chart yet.</p>
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
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-dark">
            Top dishes by revenue
          </h2>
          {isLoading ? (
            <p className="py-6 text-center text-sm text-mid">Loading…</p>
          ) : top.length === 0 ? (
            <p className="py-6 text-center text-sm text-mid">Not enough data yet.</p>
          ) : (
            <table className="w-full overflow-hidden rounded-xl text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-mid">
                  <th className="px-3 py-2 font-semibold">#</th>
                  <th className="px-3 py-2 font-semibold">Dish</th>
                  <th className="px-3 py-2 text-right font-semibold">Orders</th>
                  <th className="px-3 py-2 text-right font-semibold">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {top.map((d, idx) => (
                  <tr
                    key={d.menuItemId}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-surface'}
                  >
                    <td className="px-3 py-2 font-bold tabular-nums text-dark">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2 text-dark">{d.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-mid">
                      {d.ordersCount}
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums text-brand">
                      {formatPence(d.revenuePence)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function weekLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { weekday: 'short' });
}
