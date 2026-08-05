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
import { CalendarHeart } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toaster';
import { useApi } from '@/hooks/use-api';
import { formatDateTime } from '@/lib/format';

interface CateringEnquiry {
  id: string;
  occasionType: string;
  guestCountBand: string;
  cuisineStyle?: string | null;
  postcode: string;
  eventDate?: string | null;
  preferredTime?: string | null;
  budgetBand?: string | null;
  contactName: string;
  email: string;
  phone?: string | null;
  notes?: string | null;
  status: string;
  adminNotes?: string | null;
  source?: string | null;
  createdAt: string;
}

interface ListPage {
  data: CateringEnquiry[];
  nextCursor: string | null;
}

const STATUS_TONE: Record<string, StatusTone> = {
  NEW: 'info',
  QUALIFIED: 'warning',
  MATCHED: 'brand',
  WON: 'success',
  LOST: 'danger',
};

const STATUSES = ['NEW', 'QUALIFIED', 'MATCHED', 'WON', 'LOST'];

export function CateringEnquiriesClient() {
  const { request } = useApi();
  const { toast } = useToast();

  const [status, setStatus] = useState('ALL');
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined]);
  const cursor = cursorStack[cursorStack.length - 1];
  const [page, setPage] = useState<ListPage | null>(null);
  const [loading, setLoading] = useState(true);

  // Detail panel
  const [selected, setSelected] = useState<CateringEnquiry | null>(null);
  const [panelStatus, setPanelStatus] = useState('');
  const [panelNotes, setPanelNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadPage = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status !== 'ALL') params.set('status', status);
    if (cursor) params.set('cursor', cursor);
    params.set('limit', '50');
    request<ListPage>(`/catering-enquiries?${params.toString()}`)
      .then(setPage)
      .catch(() => setPage(null))
      .finally(() => setLoading(false));
  }, [request, status, cursor]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const hasNext = Boolean(page?.nextCursor);
  const hasPrev = cursorStack.length > 1;

  function openPanel(enq: CateringEnquiry) {
    setSelected(enq);
    setPanelStatus(enq.status);
    setPanelNotes(enq.adminNotes ?? '');
  }

  async function savePanel() {
    if (!selected) return;
    setSaving(true);
    try {
      await request(`/catering-enquiries/${selected.id}`, {
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
        title="Catering Enquiries"
        description="Public feast requests from the /catering form. Qualify and match within 48 hours."
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
          icon={CalendarHeart}
          title="No catering enquiries"
          description="Public feast requests will appear here once customers submit the form."
        />
      ) : (
        <>
          <div className="rounded-xl border border-hairline bg-white shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Occasion</TableHead>
                  <TableHead>Guests</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(page?.data ?? []).map((enq) => (
                  <TableRow key={enq.id}>
                    <TableCell>
                      <div>
                        <div className="text-sm font-medium">{enq.contactName}</div>
                        <div className="text-xs text-muted-foreground">{enq.email}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{enq.occasionType}</TableCell>
                    <TableCell className="text-sm tabular-nums">{enq.guestCountBand}</TableCell>
                    <TableCell className="font-mono text-sm">{enq.postcode}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {enq.eventDate ?? '—'}
                    </TableCell>
                    <TableCell>
                      <StatusPill tone={STATUS_TONE[enq.status] ?? 'neutral'}>
                        {enq.status}
                      </StatusPill>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(enq.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => openPanel(enq)}>
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

      {/* Detail side panel */}
      {selected && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-hairline bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
            <h2 className="text-lg font-semibold">
              {selected.contactName} — {selected.occasionType}
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
                ['Email', selected.email],
                ['Phone', selected.phone],
                ['Guests', selected.guestCountBand],
                ['Cuisine', selected.cuisineStyle],
                ['Postcode', selected.postcode],
                ['Event date', selected.eventDate],
                ['Preferred time', selected.preferredTime],
                ['Budget', selected.budgetBand],
                ['Source', selected.source],
                ['Received', formatDateTime(selected.createdAt)],
              ]
                .filter(([, v]) => v)
                .map(([label, value]) => (
                  <div key={label as string} className="flex justify-between py-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium">{value}</dd>
                  </div>
                ))}
            </dl>
            {selected.notes && (
              <div>
                <p className="mb-1 text-sm font-medium">Customer notes</p>
                <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                  {selected.notes}
                </p>
              </div>
            )}
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
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
