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
import { Download } from 'lucide-react';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
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
        description="Server-side record of staff and system actions."
        actions={
          <Button variant="outline" onClick={downloadCsv} className="gap-2">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="grid grid-cols-2 gap-3 p-4 md:grid-cols-6">
          <FilterInput label="Entity type" value={draft.entityType} onChange={(v) => setDraft({ ...draft, entityType: v })} placeholder="vendors" />
          <FilterInput label="Entity id" value={draft.entityId} onChange={(v) => setDraft({ ...draft, entityId: v })} placeholder="uuid" />
          <FilterInput label="Actor id" value={draft.actorId} onChange={(v) => setDraft({ ...draft, actorId: v })} placeholder="uuid" />
          <FilterInput label="Action" value={draft.action} onChange={(v) => setDraft({ ...draft, action: v })} placeholder="vendor.live" />
          <FilterInput label="From" type="date" value={draft.dateFrom} onChange={(v) => setDraft({ ...draft, dateFrom: v })} />
          <div className="space-y-1">
            <FilterInput label="To" type="date" value={draft.dateTo} onChange={(v) => setDraft({ ...draft, dateTo: v })} />
          </div>
          <div className="md:col-span-6">
            <Button onClick={applyFilters} size="sm">Apply</Button>
            <Button onClick={() => { setDraft({}); setFilters({}); }} size="sm" variant="ghost" className="ml-2">
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

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
                <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!isLoading && (data?.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">No matching log entries.</TableCell></TableRow>
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

function FilterInput({
  label,
  value,
  onChange,
  placeholder,
  type,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
      <Input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        placeholder={placeholder}
      />
    </div>
  );
}
