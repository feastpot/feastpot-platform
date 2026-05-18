'use client';

import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@feastpot/ui';
import Link from 'next/link';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { SearchTrendsCard } from '@/components/dashboard/search-trends-card';
import { PageHeader } from '@/components/layout/page-header';
import { useAdminDashboard } from '@/hooks/use-admin-dashboard';
import { formatPence, formatPercent } from '@/lib/format';

export function DashboardClient() {
  const { data, isLoading, error } = useAdminDashboard();

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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Metric label="GMV today" value={formatPence(data?.gmvTodayPence)} loading={isLoading} />
        <Metric label="GMV this week" value={formatPence(data?.gmvWeekPence)} loading={isLoading} />
        <Metric label="GMV this month" value={formatPence(data?.gmvMonthPence)} loading={isLoading} />
        <Metric label="Orders today" value={data?.ordersToday?.toString() ?? '-'} loading={isLoading} />
        <Metric label="Active vendors" value={data?.activeVendors?.toString() ?? '-'} loading={isLoading} />
        <Metric label="Avg basket (30 d)" value={formatPence(data?.avgBasketPence)} loading={isLoading} />
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
                  <Line type="monotone" dataKey="gmvPence" stroke="#185FA5" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Repeat customers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{formatPercent(data?.repeatOrderRatePct)}</div>
            <p className="mt-1 text-xs text-muted-foreground">
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
                      className="text-xs text-vendor underline-offset-2 hover:underline"
                    >
                      View
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {(!data || data.topVendors.length === 0) && !isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                    No vendor revenue this month yet.
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

function Metric({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-xl font-semibold">{loading ? '…' : value}</div>
      </CardContent>
    </Card>
  );
}
