'use client';

import {
  Button,
  Card,
  CardContent,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@feastpot/ui';
import { Download, Inbox } from 'lucide-react';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterCard, FilterField } from '@/components/ui/filter-card';
import { useToast } from '@/components/ui/toaster';
import { useApi } from '@/hooks/use-api';
import { useAuditLog, type AuditFilters } from '@/hooks/use-audit-log';
import { apiUrl } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';

export function AuditLogClient() {
  const { toast } = useToast();
  const { token } = useApi();
  const [filters, setFilters] = useState<AuditFilters>({});
  const [draft, setDraft] = useState<AuditFilters>({});
  const { data, isLoading, error } = useAuditLog(filters);

  function applyFilters() {
    setFilters({ ...draft });
  }

  /**
   * The CSV endpoint requires a Bearer header, so we cannot use a plain <a
   * href> link. Fetch as a Blob and trigger a synthetic download.
   */
  async function downloadCsv() {
    if (!token) {
      toast({ title: 'Not signed in', variant: 'destructive' });
      return;
    }
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
    const url = apiUrl(`/admin/audit-log.csv${params.toString() ? `?${params.toString()}` : ''}`);
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const dl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dl;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(dl);
    } catch (err) {
      toast({ title: 'CSV download failed', description: (err as Error).message, variant: 'destructive' });
    }
  }

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Track changes and actions performed across the platform."
        actions={
          <Button variant="outline" onClick={downloadCsv} className="gap-2">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <FilterCard
        className="mb-4"
        actions={
          <>
            <Button
              onClick={() => {
                setDraft({});
                setFilters({});
              }}
              size="sm"
              variant="outline"
            >
              Clear
            </Button>
            <Button onClick={applyFilters} size="sm">
              Apply
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <FilterField label="Entity type">
            <Input
              value={draft.entityType ?? ''}
              onChange={(e) => setDraft({ ...draft, entityType: e.target.value || undefined })}
              placeholder="vendors"
            />
          </FilterField>
          <FilterField label="Entity id">
            <Input
              value={draft.entityId ?? ''}
              onChange={(e) => setDraft({ ...draft, entityId: e.target.value || undefined })}
              placeholder="uuid"
            />
          </FilterField>
          <FilterField label="Actor id">
            <Input
              value={draft.actorId ?? ''}
              onChange={(e) => setDraft({ ...draft, actorId: e.target.value || undefined })}
              placeholder="uuid"
            />
          </FilterField>
          <FilterField label="Action">
            <Input
              value={draft.action ?? ''}
              onChange={(e) => setDraft({ ...draft, action: e.target.value || undefined })}
              placeholder="vendor.live"
            />
          </FilterField>
          <FilterField label="From">
            <Input
              type="date"
              value={draft.dateFrom ?? ''}
              onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value || undefined })}
            />
          </FilterField>
          <FilterField label="To">
            <Input
              type="date"
              value={draft.dateTo ?? ''}
              onChange={(e) => setDraft({ ...draft, dateTo: e.target.value || undefined })}
            />
          </FilterField>
        </div>
      </FilterCard>

      {error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Failed to load audit log: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Metadata</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (data?.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      icon={Inbox}
                      title="No matching log entries"
                      description="Try widening your filter set, or clear filters to view recent activity."
                      bordered={false}
                    />
                  </TableCell>
                </TableRow>
              )}
              {(data?.data ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs whitespace-nowrap">{formatDateTime(row.createdAt)}</TableCell>
                  <TableCell className="text-sm">
                    <div>{row.actor?.email ?? row.actorId ?? 'system'}</div>
                    <div className="text-xs text-muted-foreground capitalize">{row.actor?.role ?? '-'}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.action}</TableCell>
                  <TableCell className="text-sm">
                    <div>{row.entityType}</div>
                    <div className="font-mono text-xs text-muted-foreground">{row.entityId ?? '-'}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.ipAddress ?? '-'}</TableCell>
                  <TableCell>
                    {row.metadata ? (
                      <pre className="max-w-md overflow-x-auto rounded bg-muted p-2 text-xs">
                        {JSON.stringify(row.metadata, null, 2)}
                      </pre>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
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
