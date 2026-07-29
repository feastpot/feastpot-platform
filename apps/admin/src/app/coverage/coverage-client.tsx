'use client';

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@feastpot/ui';
import { Download, MapPin } from 'lucide-react';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterCard, FilterField } from '@/components/ui/filter-card';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toaster';
import { useApi } from '@/hooks/use-api';
import {
  buildCoverageInterestParams,
  useCoverageInterestList,
  useCoverageWaitlist,
  type CoverageInterestFilters,
} from '@/hooks/use-coverage-waitlist';
import { apiUrl } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';

export function CoverageClient() {
  const { toast } = useToast();
  const { token } = useApi();

  const [postcode, setPostcode] = useState('');
  const [notified, setNotified] = useState<'all' | 'true' | 'false'>('all');

  // Cursor stack: page 0 has cursor undefined; Next pushes, Prev pops.
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined]);
  const cursor = cursorStack[cursorStack.length - 1];

  const filters: CoverageInterestFilters = useMemo(
    () => ({
      postcode: postcode.trim() || undefined,
      notified: notified === 'all' ? undefined : notified,
      cursor,
      limit: 50,
    }),
    [postcode, notified, cursor],
  );

  const { data, isLoading, error } = useCoverageInterestList(filters);
  const { data: summary } = useCoverageWaitlist();

  const rows = data?.data ?? [];
  const hasNext = Boolean(data?.nextCursor);
  const hasPrev = cursorStack.length > 1;

  function resetPaging() {
    setCursorStack([undefined]);
  }

  /** CSV endpoint needs the Bearer header, so fetch as Blob + synthetic download. */
  async function downloadCsv() {
    if (!token) {
      toast({ title: 'Not signed in', variant: 'destructive' });
      return;
    }
    const url = apiUrl(
      `/admin/coverage-interest.csv${buildCoverageInterestParams({ ...filters, cursor: undefined })}`,
    );
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const dl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dl;
      a.download = `coverage-waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(dl);
    } catch (err) {
      toast({
        title: 'CSV download failed',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  }

  return (
    <>
      <PageHeader
        title="Coverage waitlist"
        description={`Customers who asked to be notified when Feastpot reaches their postcode${
          summary ? ` — ${summary.total} total` : ''
        }.`}
      />

      <FilterCard
        className="mb-4 mt-6"
        actions={
          <Button variant="outline" size="sm" className="gap-2" onClick={downloadCsv}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FilterField label="Postcode">
            <Input
              placeholder="e.g. SE15"
              value={postcode}
              onChange={(e) => {
                setPostcode(e.target.value);
                resetPaging();
              }}
            />
          </FilterField>
          <FilterField label="Notified">
            <Select
              value={notified}
              onValueChange={(v) => {
                setNotified(v as 'all' | 'true' | 'false');
                resetPaging();
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="false">Not yet notified</SelectItem>
                <SelectItem value="true">Notified</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
        </div>
      </FilterCard>

      {error ? (
        <EmptyState icon={MapPin} title="Failed to load waitlist" description={String(error)} />
      ) : isLoading ? (
        <EmptyState icon={MapPin} title="Loading…" description="Fetching the waitlist." />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No waitlist entries"
          description="No one matches these filters yet."
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Signed up</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Postcode</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Marketing consent</TableHead>
                <TableHead>Notified</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{formatDateTime(r.createdAt)}</TableCell>
                  <TableCell>{r.email}</TableCell>
                  <TableCell className="font-medium">{r.postcode}</TableCell>
                  <TableCell>{r.name ?? '—'}</TableCell>
                  <TableCell>
                    {r.marketingConsent == null ? '—' : r.marketingConsent ? 'Yes' : 'No'}
                  </TableCell>
                  <TableCell>
                    <StatusPill tone={r.notified ? 'success' : 'neutral'}>
                      {r.notified ? 'Notified' : 'Waiting'}
                    </StatusPill>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!hasPrev}
              onClick={() => setCursorStack((s) => s.slice(0, -1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasNext}
              onClick={() => setCursorStack((s) => [...s, data!.nextCursor!])}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </>
  );
}
