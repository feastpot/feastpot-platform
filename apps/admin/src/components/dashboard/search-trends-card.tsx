'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@feastpot/ui';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Link from 'next/link';

import { useSearchAnalytics, type SearchAnalyticsRow } from '@/hooks/use-search-analytics';

/**
 * Colour-codes a search row by how well-served it was:
 *   green  ≥ 3 results on average - healthy supply
 *   amber  1–2 results            - thin supply, watchlist
 *   red    0 results              - recruitment opportunity
 */
function barColour(avgResults: number): string {
  if (avgResults >= 3) return '#1D9E75'; // teal (brand)
  if (avgResults >= 1) return '#E59E1B'; // amber
  return '#D93B3B'; // red
}

function truncateSearchTerm(term: string, maxLength = 18): string {
  return term.length > maxLength ? `${term.slice(0, maxLength - 1)}…` : term;
}

/**
 * FR-SRCH-001 admin widget. Two pieces:
 *   1. Horizontal bar chart of the top 10 searches in the last 30 days,
 *      coloured by average results returned.
 *   2. A "recruitment opportunity" callout listing queries that returned
 *      zero results more than 3 times - high-signal demand that the
 *      catalog can't yet meet.
 */
export function SearchTrendsCard() {
  const { rows, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSearchAnalytics();

  const top10 = rows.slice(0, 10);
  const opportunities = rows.filter((r) => r.avgResults === 0 && r.searchCount > 3);

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
          <p className="text-sm text-muted-foreground">No customer searches recorded yet.</p>
        )}

        {top10.length > 0 && (
          <>
            <ul
              className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
              aria-label="Search result supply legend"
            >
              <li className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#1D9E75]" aria-hidden /> Healthy supply
                (3+ average results)
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#E59E1B]" aria-hidden /> Thin supply
                (1–2 average results)
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#D93B3B]" aria-hidden /> No vendors
                found (0 average results)
              </li>
            </ul>
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={top10}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                >
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="query"
                    width={120}
                    tick={{ fontSize: 11 }}
                    tickFormatter={truncateSearchTerm}
                  />
                  <Tooltip
                    labelFormatter={(label) => `Search term: ${label}`}
                    formatter={(
                      value: number,
                      name: string,
                      item: { payload?: SearchAnalyticsRow },
                    ) => {
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
          </>
        )}

        {opportunities.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <h3 className="text-sm font-semibold text-amber-900">Recruitment opportunity</h3>
            <p className="mt-1 text-xs text-amber-800">
              Customers searched for these but found no vendors:
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {opportunities.slice(0, 12).map((o) => (
                <li
                  key={o.query}
                  className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-amber-900 shadow-sm"
                >
                  <Link
                    href={`/vendor-recommendations?search=${encodeURIComponent(o.query)}`}
                    className="hover:underline"
                    title={`View vendor recommendations matching ${o.query}`}
                  >
                    {o.query}
                  </Link>
                  <span className="text-[10px] font-normal text-amber-700">({o.searchCount})</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {hasNextPage && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              {isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
