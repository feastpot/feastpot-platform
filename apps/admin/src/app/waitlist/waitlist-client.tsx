'use client';

import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@feastpot/ui';
import { MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { useApi } from '@/hooks/use-api';
import { formatDateTime } from '@/lib/format';

interface DemandRow {
  outwardCode: string;
  count: number;
  latestAt: string;
}

interface WaitlistRow {
  id: string;
  email: string;
  postcode: string;
  outwardCode: string;
  whatsapp?: string | null;
  favouriteCuisine?: string | null;
  source: string;
  createdAt: string;
}

interface WaitlistPage {
  data: WaitlistRow[];
  nextCursor: string | null;
}

type Tab = 'demand' | 'signups';

export function WaitlistClient() {
  const { request } = useApi();

  const [tab, setTab] = useState<Tab>('demand');
  const [demand, setDemand] = useState<DemandRow[]>([]);
  const [demandLoading, setDemandLoading] = useState(true);

  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined]);
  const cursor = cursorStack[cursorStack.length - 1];
  const [page, setPage] = useState<WaitlistPage | null>(null);
  const [pageLoading, setPageLoading] = useState(false);

  useEffect(() => {
    setDemandLoading(true);
    request<DemandRow[]>('/waitlist/demand')
      .then(setDemand)
      .catch(() => setDemand([]))
      .finally(() => setDemandLoading(false));
  }, [request]);

  useEffect(() => {
    if (tab !== 'signups') return;
    setPageLoading(true);
    const qs = cursor ? `?cursor=${cursor}&limit=50` : '?limit=50';
    request<WaitlistPage>(`/waitlist${qs}`)
      .then(setPage)
      .catch(() => setPage(null))
      .finally(() => setPageLoading(false));
  }, [request, tab, cursor]);

  const hasNext = Boolean(page?.nextCursor);
  const hasPrev = cursorStack.length > 1;

  return (
    <div>
      <PageHeader
        title="Postcode Waitlist"
        description="Demand by area and individual signups from the public waitlist form."
      />

      {/* Tabs */}
      <div className="mb-6 flex gap-2 border-b border-hairline">
        {(['demand', 'signups'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? 'border-b-2 border-teal text-teal-dark'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setTab(t)}
          >
            {t === 'demand' ? 'Demand by area' : 'All signups'}
          </button>
        ))}
      </div>

      {tab === 'demand' && (
        <>
          {demandLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : demand.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="No waitlist signups yet"
              description="They will appear here once someone signs up from the homepage."
            />
          ) : (
            <div className="rounded-xl border border-hairline bg-white shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Outward code</TableHead>
                    <TableHead className="text-right">Signups</TableHead>
                    <TableHead>Most recent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {demand.map((row) => (
                    <TableRow key={row.outwardCode}>
                      <TableCell className="font-mono font-medium">{row.outwardCode}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(row.latestAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      {tab === 'signups' && (
        <>
          {pageLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (page?.data ?? []).length === 0 ? (
            <EmptyState icon={MapPin} title="No signups" description="No waitlist entries found." />
          ) : (
            <>
              <div className="rounded-xl border border-hairline bg-white shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Postcode</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Cuisine</TableHead>
                      <TableHead>Signed up</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(page?.data ?? []).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-sm">{row.email}</TableCell>
                        <TableCell className="font-mono text-sm">{row.postcode}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.source}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.favouriteCuisine ?? '–'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDateTime(row.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!hasPrev}
                  onClick={() => setCursorStack((s) => s.slice(0, -1))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!hasNext}
                  onClick={() => {
                    if (page?.nextCursor) setCursorStack((s) => [...s, page.nextCursor!]);
                  }}
                >
                  Next
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
