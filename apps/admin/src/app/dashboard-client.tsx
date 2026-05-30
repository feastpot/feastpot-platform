'use client';

import {
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
import {
  Banknote,
  CalendarRange,
  MapPin,
  PoundSterling,
  Receipt,
  Store,
  TrendingUp,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { SearchTrendsCard } from '@/components/dashboard/search-trends-card';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/ui/stat-card';
import { useAdminDashboard } from '@/hooks/use-admin-dashboard';
import { useCoverageWaitlist } from '@/hooks/use-coverage-waitlist';
import { formatPence, formatPercent } from '@/lib/format';

export function DashboardClient() {
  const { data, isLoading, error } = useAdminDashboard();
  const { data: coverage, isLoading: coverageLoading } = useCoverageWaitlist();
  const topWaitlistPostcode = coverage?.topPostcodes?.[0];

  return (
    <>
      <PageHeader title="Dashboard" description="Operations overview across the marketplace." />

      {error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Failed to load dashboard: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-7">
        <StatCard
          icon={PoundSterling}
          tone="brand"
          label="GMV today"
          value={isLoading ? '…' : formatPence(data?.gmvTodayPence)}
          caption="vs yesterday"
        />
        <StatCard
          icon={CalendarRange}
          tone="brand"
          label="GMV this week"
          value={isLoading ? '…' : formatPence(data?.gmvWeekPence)}
          caption="vs last week"
        />
        <StatCard
          icon={Banknote}
          tone="brand"
          label="GMV this month"
          value={isLoading ? '…' : formatPence(data?.gmvMonthPence)}
          caption="vs last month"
        />
        <StatCard
          icon={Receipt}
          tone="amber"
          label="Orders today"
          value={isLoading ? '…' : data?.ordersToday?.toString() ?? '-'}
          caption="vs yesterday"
        />
        <StatCard
          icon={Store}
          tone="teal"
          label="Active vendors"
          value={isLoading ? '…' : data?.activeVendors?.toString() ?? '-'}
          caption="vs last month"
        />
        <StatCard
          icon={TrendingUp}
          tone="teal"
          label="Avg basket (30 d)"
          value={isLoading ? '…' : formatPence(data?.avgBasketPence)}
          caption="vs last 30 days"
        />
        <StatCard
          icon={MapPin}
          tone="blue"
          label="Coverage waitlist"
          value={coverageLoading ? '…' : coverage?.total?.toString() ?? '-'}
          caption={
            topWaitlistPostcode
              ? `Top: ${topWaitlistPostcode.postcode} (${topWaitlistPostcode.count})`
              : 'Uncovered-postcode sign-ups'
          }
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Daily revenue (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data?.dailyRevenue ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(d: string) => d.slice(5)}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => `£${Math.round(v / 100)}`}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatPence(value), 'GMV']}
                    labelFormatter={(d: string) => d}
                  />
                  <Line type="monotone" dataKey="gmvPence" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Repeat customers</CardTitle>
            <span
              aria-hidden="true"
              className="grid h-10 w-10 place-items-center rounded-full bg-teal-light text-teal-dark"
            >
              <Users className="h-5 w-5" />
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-extrabold tracking-tight text-foreground">
              {formatPercent(data?.repeatOrderRatePct)}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Share of customers in the last 90 days with ≥2 delivered orders.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Vendor performance (this month)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-right">#</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">GMV</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Rating</TableHead>
                <TableHead className="text-right">Reorder %</TableHead>
                <TableHead className="text-right">Dispute %</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.topVendors ?? []).map((v, i) => (
                <TableRow key={v.vendorId}>
                  <TableCell className="text-right text-xs text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{v.businessName}</TableCell>
                  <TableCell className="text-right">{formatPence(v.gmvPence)}</TableCell>
                  <TableCell className="text-right">{v.ordersCount}</TableCell>
                  <TableCell className="text-right">{v.rating.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{formatPercent(v.reorderRatePct)}</TableCell>
                  <TableCell className={`text-right ${disputeColor(v.disputeRatePct)}`}>
                    {formatPercent(v.disputeRatePct)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/vendors/${v.vendorId}`}
                      className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                    >
                      View
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {(!data || data.topVendors.length === 0) && !isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
                    <EmptyState
                      icon={Store}
                      title="No vendor revenue this month yet"
                      description="As soon as vendors start trading, their performance will rank here."
                      bordered={false}
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <SearchTrendsCard />
    </>
  );
}

/** FR-ADM-002 traffic-light: green <2 %, amber 2–5 %, red >5 % dispute rate. */
function disputeColor(pct: number): string {
  if (pct > 5) return 'text-destructive font-semibold';
  if (pct >= 2) return 'text-amber-600';
  return 'text-emerald-600';
}
