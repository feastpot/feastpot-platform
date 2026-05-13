'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@feastpot/ui';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { useSearchAnalytics, type SearchAnalyticsRow } from '@/hooks/use-search-analytics';

/**
 * Colour-codes a search row by how well-served it was:
 *   green  ≥ 3 results on average — healthy supply
 *   amber  1–2 results            — thin supply, watchlist
 *   red    0 results              — recruitment opportunity
 */
function barColour(avgResults: number): string {
  if (avgResults >= 3) return '#1D9E75'; // teal (brand)
  if (avgResults >= 1) return '#E59E1B'; // amber
  return '#D93B3B'; // red
}

/**
 * FR-SRCH-001 admin widget. Two pieces:
 *   1. Horizontal bar chart of the top 10 searches in the last 30 days,
 *      coloured by average results returned.
 *   2. A "recruitment opportunity" callout listing queries that returned
 *      zero results more than 3 times — high-signal demand that the
 *      catalog can't yet meet.
 */
export function SearchTrendsCard() {
  const { data, isLoading, error } = useSearchAnalytics();

  const top10 = (data ?? []).slice(0, 10);
  const opportunities = (data ?? []).filter(
    (r) => r.avgResults === 0 && r.searchCount > 3,
  );

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">Search trends (last 30 days)</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="text-sm text-destructive">
            Failed to load search analytics: {(error as Error).message}
          </p>
        )}
        {isLoading && <p className="text-sm text-muted-foreground">Loading search data…</p>}

        {!isLoading && !error && top10.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No customer searches recorded yet.
          </p>
        )}

        {top10.length > 0 && (
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={top10}
                layout="vertical"
                margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
              >
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="query"
                  width={120}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value: number, name: string, item: { payload?: SearchAnalyticsRow }) => {
                    const row = item.payload;
                    return [
                      `${value} searches · avg ${row?.avgResults ?? 0} results`,
                      'Searches',
                    ];
                  }}
                />
                <Bar dataKey="searchCount" radius={[0, 4, 4, 0]}>
                  {top10.map((row) => (
                    <Cell key={row.query} fill={barColour(row.avgResults)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {opportunities.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <h3 className="text-sm font-semibold text-amber-900">
              Recruitment opportunity
            </h3>
            <p className="mt-1 text-xs text-amber-800">
              Customers searched for these but found no vendors:
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {opportunities.slice(0, 12).map((o) => (
                <li
                  key={o.query}
                  className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-amber-900 shadow-sm"
                >
                  {o.query}
                  <span className="text-[10px] font-normal text-amber-700">
                    ({o.searchCount})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
