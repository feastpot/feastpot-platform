'use client';

import {
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@feastpot/ui';
import { ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { TabPills, type TabPillItem } from '@/components/ui/tab-pills';
import { useApi } from '@/hooks/use-api';
import { formatDate } from '@/lib/format';
import { AdminAgeingBadge } from '@/components/ui/admin-ageing-badge';
import { getAdminAgeing } from '@/lib/admin-ageing';

const STATES = [
  'Applied',
  'Under review',
  'Info requested',
  'Approved',
  'Onboarding',
  'Live',
  'Probation',
  'Suspended',
  'Removed',
  'Rejected',
] as const;
type State = (typeof STATES)[number];
type Pipeline = {
  rows: Array<{
    id: string;
    recordType: 'application' | 'vendor';
    recordId: string;
    lifecycle: State;
    name: string;
    contact: string;
    submittedAt: string;
    lastChasedAt: string | null;
    href: string;
  }>;
  counts: Record<State, number>;
  total: number;
};

export function SupplyPipelineClient({ canIncludeTestData }: { canIncludeTestData: boolean }) {
  const { request, ready } = useApi();
  const qc = useQueryClient();
  const [state, setState] = useState<State | 'All'>('All');
  const [includeTestData, setIncludeTestData] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['admin', 'supply-pipeline', state, includeTestData],
    enabled: ready,
    queryFn: () =>
      request<Pipeline>(
        `/admin/supply-pipeline?${new URLSearchParams({ ...(state === 'All' ? {} : { status: state }), ...(includeTestData ? { includeTestData: 'true' } : {}) })}`,
      ),
  });
  const chase = useMutation({
    mutationFn: (applicationIds: string[]) =>
      request<{
        succeeded: number;
        failed: number;
        results: Array<{ applicationId: string; ok: boolean; error?: string }>;
      }>('/admin/vendor-applications/bulk/request-information', {
        method: 'POST',
        body: { applicationIds, ...(message.trim() ? { message: message.trim() } : {}) },
      }),
    onSuccess: (data) => {
      setResult(
        `${data.succeeded} request${data.succeeded === 1 ? '' : 's'} sent; ${data.failed} could not be sent.${
          data.failed
            ? ` ${data.results
                .filter((row) => !row.ok)
                .map((row) => row.error)
                .join(' ')}`
            : ''
        }`,
      );
      setSelected([]);
      void qc.invalidateQueries({ queryKey: ['admin', 'supply-pipeline'] });
    },
    onError: (error) => setResult((error as Error).message),
  });
  const rows = query.data?.rows ?? [];
  const applicationRows = rows.filter(
    (row) => row.recordType === 'application' && !['Approved', 'Rejected'].includes(row.lifecycle),
  );
  const tabs: ReadonlyArray<TabPillItem<State | 'All'>> = [
    { value: 'All', label: 'All', count: query.data?.total },
    ...STATES.map((value) => ({ value, label: value, count: query.data?.counts[value] })),
  ];
  const toggle = (id: string) =>
    setSelected((old) => (old.includes(id) ? old.filter((value) => value !== id) : [...old, id]));
  return (
    <>
      <PageHeader
        title="Supply pipeline"
        description="One lifecycle for vendor applications and vendor records. Counts exclude persisted test data by default."
      />
      <div className="mb-4">
        <TabPills
          items={tabs}
          value={state}
          onChange={setState}
          ariaLabel="Supply lifecycle filter"
        />
        {canIncludeTestData && (
          <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={includeTestData}
              onChange={(event) => setIncludeTestData(event.target.checked)}
            />
            Include persisted test data
          </label>
        )}
      </div>
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-3 py-3">
          <span className="text-sm font-medium">{selected.length} selected</span>
          <input
            aria-label="Information request message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={2000}
            placeholder="Optional message (missing FSA/required fields are included)"
            className="min-w-72 flex-1 rounded border border-input px-3 py-2 text-sm"
          />
          <Button
            size="sm"
            disabled={!selected.length || chase.isPending}
            onClick={() => chase.mutate(selected)}
          >
            Request information
          </Button>
          {result && (
            <p role="status" className="w-full text-sm text-muted-foreground">
              {result}
            </p>
          )}
        </CardContent>
      </Card>
      {query.error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          Failed to load pipeline: {(query.error as Error).message}
        </p>
      )}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <input
                    aria-label="Select all actionable applications"
                    type="checkbox"
                    checked={
                      applicationRows.length > 0 &&
                      applicationRows.every((row) => selected.includes(row.recordId))
                    }
                    onChange={(event) =>
                      setSelected(
                        event.target.checked ? applicationRows.map((row) => row.recordId) : [],
                      )
                    }
                  />
                </TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Lifecycle</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead>Last chased</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="py-6 text-center">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!query.isLoading && !rows.length && (
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
                    <EmptyState
                      icon={ClipboardList}
                      title="No records in this lifecycle state"
                      description="Supplier records will appear here as they progress."
                      bordered={false}
                    />
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {row.recordType === 'application' &&
                      !['Approved', 'Rejected'].includes(row.lifecycle) && (
                        <input
                          aria-label={`Select ${row.name}`}
                          type="checkbox"
                          checked={selected.includes(row.recordId)}
                          onChange={() => toggle(row.recordId)}
                        />
                      )}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{row.name}</div>
                    <div className="text-xs text-muted-foreground">{row.contact}</div>
                  </TableCell>
                  <TableCell className="capitalize">{row.recordType}</TableCell>
                  <TableCell>{row.lifecycle}</TableCell>
                  <TableCell>{formatDate(row.submittedAt)}</TableCell>
                  <TableCell>
                    <AdminAgeingBadge
                      state={getAdminAgeing({
                        createdAt: row.lastChasedAt ?? row.submittedAt,
                        businessDays: 2,
                        terminal:
                          row.recordType !== 'application' ||
                          ['Approved', 'Rejected'].includes(row.lifecycle),
                      })}
                    />
                  </TableCell>
                  <TableCell>{row.lastChasedAt ? formatDate(row.lastChasedAt) : '—'}</TableCell>
                  <TableCell className="space-x-2">
                    {row.recordType === 'application' &&
                      !['Approved', 'Rejected'].includes(row.lifecycle) && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={chase.isPending}
                          onClick={() => chase.mutate([row.recordId])}
                        >
                          Request info
                        </Button>
                      )}
                    <Link
                      href={row.href}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Open
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
