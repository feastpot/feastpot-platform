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
type Row = {
  id: string;
  recordType: 'application' | 'vendor';
  recordId: string;
  lifecycle: State;
  name: string;
  contact: string;
  submittedAt: string;
  lastChasedAt: string | null;
  href: string;
  missingItems?: string[];
  missingItemLinks?: Array<{ item: string; href: string }>;
  ageingDays?: number;
};
type Pipeline = { rows: Row[]; counts: Record<State, number>; total: number };
type Application = { id: string; missingItems: string[]; ageingDays: number };
type RecoveryRow = {
  vendorId: string;
  businessName: string;
  email: string;
  vendorPortalUrl: string;
  missingItem: string;
  ageHours: number;
  chaseHistory: Array<{ stage: string; channel: string; dueAt: string; sentAt: string | null }>;
};
type RecoveryResult = { vendorId: string; ok: boolean; result?: unknown; error?: string };
const cooldown = (date: string | null) =>
  Boolean(date && Date.now() - new Date(date).getTime() < 7 * 86_400_000);

export function SupplyPipelineClient({
  canIncludeTestData,
  canRequestInformation,
}: {
  canIncludeTestData: boolean;
  canRequestInformation: boolean;
}) {
  const { request, ready } = useApi();
  const qc = useQueryClient();
  const [state, setState] = useState<State | 'All'>('All');
  const [includeTestData, setIncludeTestData] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [recoverySelected, setRecoverySelected] = useState<string[]>([]);
  const [recoveryChannel, setRecoveryChannel] = useState<'email' | 'sms'>('email');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [recoveryChasedAt, setRecoveryChasedAt] = useState<Record<string, string>>({});
  const query = useQuery({
    queryKey: ['admin', 'supply-pipeline', state, includeTestData],
    enabled: ready,
    queryFn: async () => {
      const qs = new URLSearchParams({
        ...(state === 'All' ? {} : { status: state }),
        ...(includeTestData ? { includeTestData: 'true' } : {}),
      });
      const [pipeline, applications] = await Promise.all([
        request<Pipeline>(`/admin/supply-pipeline?${qs}`),
        request<Array<Application & { missingItemLinks: Array<{ item: string; href: string }> }>>(
          `/admin/vendor-applications?${includeTestData ? 'includeTestData=true' : ''}`,
        ),
      ]);
      const byId = new Map(applications.map((application) => [application.id, application]));
      return {
        ...pipeline,
        rows: pipeline.rows.map((row) =>
          row.recordType === 'application' && byId.has(row.recordId)
            ? { ...row, ...byId.get(row.recordId) }
            : row,
        ),
      };
    },
  });
  const recovery = useQuery({
    queryKey: ['admin', 'vendor-recovery'],
    enabled: ready,
    queryFn: () => request<RecoveryRow[]>('/admin/vendor-recovery'),
  });
  const chase = useMutation({
    mutationFn: async (applicationIds: string[]) => {
      const body = message.trim() ? { message: message.trim() } : {};
      if (applicationIds.length === 1) {
        await request(`/admin/vendor-applications/${applicationIds[0]}/request-information`, {
          method: 'POST',
          body,
        });
        return {
          succeeded: 1,
          failed: 0,
          results: [{ applicationId: applicationIds[0], ok: true, error: undefined }],
        };
      }
      return request<{
        succeeded: number;
        failed: number;
        results: Array<{ applicationId: string; ok: boolean; error?: string }>;
      }>('/admin/vendor-applications/bulk/request-information', {
        method: 'POST',
        body: { applicationIds, ...body },
      });
    },
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
  const recoveryChase = useMutation({
    mutationFn: async (vendorIds: string[]) => {
      const rows = (recovery.data ?? []).filter((row) => vendorIds.includes(row.vendorId));
      const dto = (row: RecoveryRow) => ({
        item: row.missingItem,
        channel: recoveryChannel,
        ...(recoveryMessage.trim() ? { message: recoveryMessage.trim() } : {}),
      });
      if (rows.length === 1) {
        const row = rows[0];
        if (!row) return { results: [] as RecoveryResult[] };
        return {
          results: [
            {
              vendorId: row.vendorId,
              ok: true,
              result: await request(`/admin/vendor-recovery/${row.vendorId}/chase`, {
                method: 'POST',
                body: dto(row),
              }),
            },
          ] as RecoveryResult[],
        };
      }
      return {
        results: await request<RecoveryResult[]>('/admin/vendor-recovery/bulk-chase', {
          method: 'POST',
          body: { requests: rows.map((row) => ({ vendorId: row.vendorId, dto: dto(row) })) },
        }),
      };
    },
    onSuccess: (data) => {
      const now = new Date().toISOString();
      setRecoveryChasedAt((old) => {
        const next = { ...old };
        data.results
          .filter((row) => row.ok)
          .forEach((row) => {
            next[row.vendorId] = now;
          });
        return next;
      });
      setRecoverySelected([]);
      setResult(
        `${data.results.filter((row) => row.ok).length} recovery chase${data.results.filter((row) => row.ok).length === 1 ? '' : 's'} sent; ${data.results.filter((row) => !row.ok).length} failed.${
          data.results.filter((row) => !row.ok).length
            ? ` ${data.results
                .filter((row) => !row.ok)
                .map((row) => row.error)
                .join(' ')}`
            : ''
        }`,
      );
    },
    onError: (error) => setResult((error as Error).message),
  });
  const rows = query.data?.rows ?? [];
  const actionable = rows.filter(
    (row) => row.recordType === 'application' && !['Approved', 'Rejected'].includes(row.lifecycle),
  );
  const tabs: ReadonlyArray<TabPillItem<State | 'All'>> = [
    { value: 'All', label: 'All', count: query.data?.total },
    ...STATES.map((value) => ({ value, label: value, count: query.data?.counts[value] })),
  ];
  const toggle = (id: string) =>
    setSelected((old) =>
      old.includes(id)
        ? old.filter((value) => value !== id)
        : old.length >= 100
          ? old
          : [...old, id],
    );
  return (
    <>
      <PageHeader
        title="Supply pipeline"
        description="See where every prospective vendor is waiting, what is missing, and chase without leaving the queue."
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
              onChange={(e) => setIncludeTestData(e.target.checked)}
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
            onChange={(e) => setMessage(e.target.value)}
            maxLength={2000}
            placeholder="Optional message"
            className="min-w-72 flex-1 rounded border border-input px-3 py-2 text-sm"
          />
          <Button
            size="sm"
            disabled={!selected.length || chase.isPending || !canRequestInformation}
            onClick={() => chase.mutate(selected)}
          >
            Request information
          </Button>
          {selected.length >= 100 && (
            <span className="text-xs text-muted-foreground">Maximum 100 selected</span>
          )}
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
      {recovery.error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          Failed to load post-approval recovery: {(recovery.error as Error).message}
        </p>
      )}
      {recovery.data && recovery.data.length > 0 && (
        <Card className="mb-4">
          <CardContent className="p-0">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-semibold">Post-approval recovery</h2>
              <p className="text-xs text-muted-foreground">
                Staff chase through the authorised recovery action. The portal URL is reference-only
                and never opens as the action.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-4 py-3">
              <span className="text-sm font-medium">{recoverySelected.length} selected</span>
              <select
                aria-label="Recovery notification channel"
                value={recoveryChannel}
                onChange={(e) => setRecoveryChannel(e.target.value as 'email' | 'sms')}
                className="rounded border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="email">Email</option>
                <option value="sms">SMS</option>
              </select>
              <input
                aria-label="Recovery chase message"
                value={recoveryMessage}
                onChange={(e) => setRecoveryMessage(e.target.value)}
                maxLength={1000}
                placeholder="Optional recovery message"
                className="min-w-56 flex-1 rounded border border-input px-3 py-1.5 text-sm"
              />
              <Button
                size="sm"
                disabled={!recoverySelected.length || recoveryChase.isPending}
                onClick={() => recoveryChase.mutate(recoverySelected)}
              >
                Chase selected
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <input
                        aria-label="Select all recovery vendors"
                        type="checkbox"
                        checked={
                          recoverySelected.length > 0 &&
                          recoverySelected.length === recovery.data.length
                        }
                        onChange={(e) =>
                          setRecoverySelected(
                            e.target.checked
                              ? recovery.data.slice(0, 100).map((row) => row.vendorId)
                              : [],
                          )
                        }
                      />
                    </TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Missing item</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead>Chase history</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recovery.data.map((row) => {
                    const last = recoveryChasedAt[row.vendorId];
                    const cooling = Boolean(
                      last && Date.now() - new Date(last).getTime() < 7 * 86_400_000,
                    );
                    return (
                      <TableRow key={row.vendorId}>
                        <TableCell>
                          <input
                            aria-label={`Select recovery chase for ${row.businessName}`}
                            type="checkbox"
                            checked={recoverySelected.includes(row.vendorId)}
                            disabled={cooling}
                            onChange={() =>
                              setRecoverySelected((old) =>
                                old.includes(row.vendorId)
                                  ? old.filter((id) => id !== row.vendorId)
                                  : old.length >= 100
                                    ? old
                                    : [...old, row.vendorId],
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{row.businessName}</div>
                          <div className="text-xs text-muted-foreground">{row.email}</div>
                        </TableCell>
                        <TableCell>{row.missingItem}</TableCell>
                        <TableCell className="tabular-nums">{row.ageHours}h</TableCell>
                        <TableCell>
                          <details>
                            <summary className="cursor-pointer text-sm text-primary">
                              {row.chaseHistory.length} stage
                              {row.chaseHistory.length === 1 ? '' : 's'}
                              {last ? ` · last chased ${formatDate(last)}` : ''}
                            </summary>
                            <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                              {row.chaseHistory.map((stage) => (
                                <li key={`${stage.stage}-${stage.dueAt}`}>
                                  {stage.stage} · {stage.channel} ·{' '}
                                  {stage.sentAt
                                    ? `sent ${formatDate(stage.sentAt)}`
                                    : `due ${formatDate(stage.dueAt)}`}
                                </li>
                              ))}
                            </ul>
                          </details>
                        </TableCell>
                        <TableCell>
                          <a
                            href={row.vendorPortalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted-foreground underline"
                          >
                            External reference
                          </a>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={recoveryChase.isPending || cooling}
                            onClick={() => recoveryChase.mutate([row.vendorId])}
                          >
                            {cooling ? 'Cooldown active' : 'Chase vendor'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <input
                      aria-label="Select all actionable applications"
                      type="checkbox"
                      checked={
                        actionable.length > 0 &&
                        actionable.every((row) => selected.includes(row.recordId))
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? actionable.slice(0, 100).map((row) => row.recordId)
                            : [],
                        )
                      }
                    />
                  </TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Lifecycle</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Missing</TableHead>
                  <TableHead>Last chased</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.isLoading && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center">
                      <span
                        className="inline-block h-4 w-40 animate-pulse rounded bg-muted"
                        aria-label="Loading pipeline"
                      />
                    </TableCell>
                  </TableRow>
                )}
                {!query.isLoading && !rows.length && (
                  <TableRow>
                    <TableCell colSpan={9} className="p-0">
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
                    <TableCell className="tabular-nums">
                      {row.ageingDays !== undefined ? (
                        `${row.ageingDays}d`
                      ) : (
                        <AdminAgeingBadge
                          state={getAdminAgeing({
                            createdAt: row.submittedAt,
                            businessDays: 2,
                            terminal: row.recordType !== 'application',
                          })}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {row.missingItems?.length ? (
                        <div className="max-w-44 text-xs">
                          <div className="font-medium text-amber-800">
                            {row.missingItems.length} missing
                          </div>
                          <div
                            className="truncate text-muted-foreground"
                            title={row.missingItems.join(', ')}
                          >
                            {row.missingItems.join(', ')}
                          </div>
                          {row.missingItemLinks?.length ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {row.missingItemLinks.map((item) => (
                                <Link
                                  key={item.item}
                                  href={item.href}
                                  className="text-primary hover:underline"
                                >
                                  {item.item}
                                </Link>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : row.recordType === 'application' ? (
                        <span className="text-xs text-muted-foreground">Complete</span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {row.lastChasedAt ? formatDate(row.lastChasedAt) : 'Not chased'}
                    </TableCell>
                    <TableCell className="space-x-2">
                      {row.recordType === 'application' &&
                        !['Approved', 'Rejected'].includes(row.lifecycle) && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              chase.isPending ||
                              !canRequestInformation ||
                              cooldown(row.lastChasedAt)
                            }
                            onClick={() => chase.mutate([row.recordId])}
                          >
                            {cooldown(row.lastChasedAt) ? 'Cooldown active' : 'Request info'}
                          </Button>
                        )}
                      <Link
                        href={row.href}
                        className="text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Open
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
