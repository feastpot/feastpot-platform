'use client';

import {
  Button,
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
import type { ChangeEvent } from 'react';

import { Store } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toaster';
import { useApi } from '@/hooks/use-api';
import { formatDateTime } from '@/lib/format';

interface VendorRec {
  id: string;
  businessName?: string | null;
  instagramHandle?: string | null;
  phone?: string | null;
  outwardCode?: string | null;
  recommendedByEmail?: string | null;
  status: string;
  adminNotes?: string | null;
  createdAt: string;
}

interface ListPage {
  data: VendorRec[];
  nextCursor: string | null;
}

const STATUS_TONE: Record<string, StatusTone> = {
  NEW: 'info',
  REVIEWING: 'warning',
  CONTACTED: 'brand',
  APPLIED: 'success',
  REJECTED: 'danger',
  ARCHIVED: 'neutral',
};

const STATUSES = ['NEW', 'REVIEWING', 'CONTACTED', 'APPLIED', 'REJECTED', 'ARCHIVED'];

export function VendorRecommendationsClient() {
  const { request } = useApi();
  const { toast } = useToast();

  const [status, setStatus] = useState('ALL');
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined]);
  const cursor = cursorStack[cursorStack.length - 1];
  const [page, setPage] = useState<ListPage | null>(null);
  const [loading, setLoading] = useState(true);

  // Detail panel
  const [selected, setSelected] = useState<VendorRec | null>(null);
  const [panelStatus, setPanelStatus] = useState('');
  const [panelNotes, setPanelNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadPage = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status !== 'ALL') params.set('status', status);
    if (cursor) params.set('cursor', cursor);
    params.set('limit', '50');
    request<ListPage>(`/vendor-recommendations?${params.toString()}`)
      .then(setPage)
      .catch(() => setPage(null))
      .finally(() => setLoading(false));
  }, [request, status, cursor]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const hasNext = Boolean(page?.nextCursor);
  const hasPrev = cursorStack.length > 1;

  function openPanel(rec: VendorRec) {
    setSelected(rec);
    setPanelStatus(rec.status);
    setPanelNotes(rec.adminNotes ?? '');
  }

  async function savePanel() {
    if (!selected) return;
    setSaving(true);
    try {
      await request(`/vendor-recommendations/${selected.id}`, {
        method: 'PATCH',
        body: { status: panelStatus, adminNotes: panelNotes },
      });
      toast({ title: 'Saved' });
      setSelected(null);
      loadPage();
    } catch {
      toast({ title: 'Failed to save', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Vendor Recommendations"
        description="Leads from the public 'recommend a cook' form. Review and reach out."
      />

      <div className="mb-6 flex items-center gap-4">
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setCursorStack([undefined]);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (page?.data ?? []).length === 0 ? (
        <EmptyState
          icon={Store}
          title="No recommendations"
          description="Recommendations will appear here when submitted via the website."
        />
      ) : (
        <>
          <div className="rounded-xl border border-hairline bg-white shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business / name</TableHead>
                  <TableHead>Instagram</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(page?.data ?? []).map((rec) => (
                  <TableRow key={rec.id}>
                    <TableCell className="font-medium">{rec.businessName ?? '–'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {rec.instagramHandle ? `@${rec.instagramHandle}` : '–'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {rec.phone ?? '–'}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{rec.outwardCode ?? '–'}</TableCell>
                    <TableCell>
                      <StatusPill tone={STATUS_TONE[rec.status] ?? 'neutral'}>
                        {rec.status}
                      </StatusPill>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(rec.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => openPanel(rec)}>
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 flex gap-2">
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

      {/* Side panel */}
      {selected && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-hairline bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
            <h2 className="text-lg font-semibold">
              {selected.businessName ?? selected.instagramHandle ?? selected.phone}
            </h2>
            <button
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setSelected(null)}
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <dl className="divide-y divide-hairline text-sm">
              {[
                ['Business', selected.businessName],
                ['Instagram', selected.instagramHandle ? `@${selected.instagramHandle}` : null],
                ['Phone', selected.phone],
                ['Area', selected.outwardCode],
                ['Recommended by', selected.recommendedByEmail],
                ['Received', formatDateTime(selected.createdAt)],
              ].map(([label, value]) =>
                value ? (
                  <div key={label as string} className="flex justify-between py-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium">{value}</dd>
                  </div>
                ) : null,
              )}
            </dl>
            <div>
              <label className="mb-1 block text-sm font-medium">Status</label>
              <Select value={panelStatus} onValueChange={setPanelStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Admin notes</label>
              <textarea
                className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={panelNotes}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setPanelNotes(e.target.value)}
                placeholder="Internal notes visible only to staff…"
                rows={5}
              />
            </div>
          </div>
          <div className="border-t border-hairline px-6 py-4">
            <Button className="w-full" onClick={savePanel} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
