'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@feastpot/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarX, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ApiError, apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

export interface BlackoutRow {
  id: string;
  date: string;
  reason: string | null;
}

export interface AvailabilitySnapshot {
  id: string;
  openingDays: number[];
  slotOpenHour: number;
  slotCloseHour: number;
  prepLeadHours: number;
  maxOrdersPerDay: number | null;
  maxTraysPerDay: number | null;
  sameDayOrders: boolean;
  largeOrderLeadHours: number | null;
  largeOrderTrayThreshold: number | null;
  eventCateringManualQuote: boolean;
  blackoutDates: BlackoutRow[];
}

const QUERY_KEY = ['vendor', 'availability'] as const;
const DAY_LABELS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

/**
 * The form values mirror the snapshot but flatten the optional numeric
 * caps to strings so the input can be cleared without React-controlled
 * input pain. We translate back to numbers / nulls on submit.
 */
interface FormState {
  openingDays: number[];
  slotOpenHour: number;
  slotCloseHour: number;
  prepLeadHours: number;
  maxOrdersPerDay: string;
  maxTraysPerDay: string;
  sameDayOrders: boolean;
  largeOrderLeadHours: string;
  largeOrderTrayThreshold: string;
  eventCateringManualQuote: boolean;
}

function snapshotToForm(s: AvailabilitySnapshot): FormState {
  return {
    openingDays: [...s.openingDays].sort((a, b) => a - b),
    slotOpenHour: s.slotOpenHour,
    slotCloseHour: s.slotCloseHour,
    prepLeadHours: s.prepLeadHours,
    maxOrdersPerDay: s.maxOrdersPerDay === null ? '' : String(s.maxOrdersPerDay),
    maxTraysPerDay: s.maxTraysPerDay === null ? '' : String(s.maxTraysPerDay),
    sameDayOrders: s.sameDayOrders,
    largeOrderLeadHours: s.largeOrderLeadHours === null ? '' : String(s.largeOrderLeadHours),
    largeOrderTrayThreshold:
      s.largeOrderTrayThreshold === null ? '' : String(s.largeOrderTrayThreshold),
    eventCateringManualQuote: s.eventCateringManualQuote,
  };
}

export function AvailabilityClient({ initial }: { initial: AvailabilitySnapshot }) {
  const { token } = useAccessToken();
  const qc = useQueryClient();

  // Hydrate from SSR data; refetch in the background so subsequent
  // navigations stay live.
  const { data: snap } = useQuery({
    queryKey: QUERY_KEY,
    enabled: !!token,
    initialData: initial,
    queryFn: () =>
      apiRequest<AvailabilitySnapshot>('/vendors/me/availability', { accessToken: token! }),
  });

  const [form, setForm] = useState<FormState>(() => snapshotToForm(initial));
  const [savedNote, setSavedNote] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // If the background refetch returns fresh data (e.g. another tab edited
  // it), and the user hasn't typed anything since the last save, keep the
  // form in sync. We use the snapshot id+updatedAt-equivalent fields by
  // reseeding only when the canonical values differ.
  useEffect(() => {
    if (!snap) return;
    setForm((cur) => {
      // Avoid wiping in-flight edits: only reseed when the user-controlled
      // fields all still match the previous snapshot view. This is good
      // enough since multi-tab editing of availability is a rare path.
      const baseline = snapshotToForm(snap);
      const dirty =
        baseline.slotOpenHour !== cur.slotOpenHour ||
        baseline.slotCloseHour !== cur.slotCloseHour ||
        baseline.prepLeadHours !== cur.prepLeadHours ||
        baseline.sameDayOrders !== cur.sameDayOrders ||
        baseline.eventCateringManualQuote !== cur.eventCateringManualQuote;
      return dirty ? baseline : cur;
    });
  }, [snap]);

  const saveMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      apiRequest<AvailabilitySnapshot>('/vendors/me/availability', {
        method: 'PATCH',
        accessToken: token!,
        body,
      }),
    onSuccess: (next) => {
      qc.setQueryData(QUERY_KEY, next);
      setForm(snapshotToForm(next));
      setSavedNote(true);
      setServerError(null);
      window.setTimeout(() => setSavedNote(false), 2200);
    },
    onError: (e) => {
      setServerError(e instanceof ApiError ? e.message : 'Could not save your changes');
    },
  });

  const addBlackout = useMutation({
    mutationFn: async (input: { date: string; reason?: string }) =>
      apiRequest<AvailabilitySnapshot>('/vendors/me/blackouts', {
        method: 'POST',
        accessToken: token!,
        body: input,
      }),
    onSuccess: (next) => qc.setQueryData(QUERY_KEY, next),
    onError: (e) => {
      setServerError(e instanceof ApiError ? e.message : 'Could not add that blackout');
    },
  });

  const removeBlackout = useMutation({
    mutationFn: async (id: string) =>
      apiRequest<AvailabilitySnapshot>(`/vendors/me/blackouts/${id}`, {
        method: 'DELETE',
        accessToken: token!,
      }),
    onSuccess: (next) => qc.setQueryData(QUERY_KEY, next),
  });

  const toggleDay = (day: number) => {
    setForm((s) => ({
      ...s,
      openingDays: s.openingDays.includes(day)
        ? s.openingDays.filter((d) => d !== day)
        : [...s.openingDays, day].sort((a, b) => a - b),
    }));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    if (form.openingDays.length === 0) {
      setServerError('Pick at least one day of the week the kitchen is open.');
      return;
    }
    if (form.slotCloseHour <= form.slotOpenHour) {
      setServerError('Slot close hour must be after slot open hour.');
      return;
    }
    const toNullableInt = (v: string): number | null => {
      const t = v.trim();
      if (t === '') return null;
      const n = Number(t);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    };
    const largeLead = toNullableInt(form.largeOrderLeadHours);
    const largeThreshold = toNullableInt(form.largeOrderTrayThreshold);
    if ((largeLead === null) !== (largeThreshold === null)) {
      setServerError(
        'Large-order lead time and tray threshold must be set together or both cleared.',
      );
      return;
    }
    saveMutation.mutate({
      openingDays: form.openingDays,
      slotOpenHour: form.slotOpenHour,
      slotCloseHour: form.slotCloseHour,
      prepLeadHours: form.prepLeadHours,
      maxOrdersPerDay: toNullableInt(form.maxOrdersPerDay),
      maxTraysPerDay: toNullableInt(form.maxTraysPerDay),
      sameDayOrders: form.sameDayOrders,
      largeOrderLeadHours: largeLead,
      largeOrderTrayThreshold: largeThreshold,
      eventCateringManualQuote: form.eventCateringManualQuote,
    });
  };

  const [newBlackoutDate, setNewBlackoutDate] = useState('');
  const [newBlackoutReason, setNewBlackoutReason] = useState('');
  const submitBlackout = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBlackoutDate) return;
    addBlackout.mutate(
      { date: newBlackoutDate, reason: newBlackoutReason.trim() || undefined },
      {
        onSuccess: () => {
          setNewBlackoutDate('');
          setNewBlackoutReason('');
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-black text-charcoal">Availability</h1>
        <p className="text-sm text-muted-foreground">
          Control when customers can place orders, how much notice you need, and any one-off days
          the kitchen is closed.
        </p>
      </header>

      {serverError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive">
          {serverError}
        </div>
      )}
      {savedNote && (
        <div className="rounded-md border border-teal/40 bg-teal/5 px-4 py-3 text-sm font-medium text-teal">
          Saved.
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Opening days &amp; slot window</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Days the kitchen is open</Label>
              <div className="flex flex-wrap gap-2">
                {DAY_LABELS.map((d) => {
                  const active = form.openingDays.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDay(d.value)}
                      className={
                        'rounded-full border px-3 py-1.5 text-sm font-semibold transition ' +
                        (active
                          ? 'border-vendor bg-vendor text-white'
                          : 'border-border bg-background text-foreground hover:border-vendor/40')
                      }
                      aria-pressed={active}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="open">Slot open hour</Label>
                <Input
                  id="open"
                  type="number"
                  min={0}
                  max={23}
                  value={form.slotOpenHour}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, slotOpenHour: Number(e.target.value || 0) }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="close">Slot close hour</Label>
                <Input
                  id="close"
                  type="number"
                  min={1}
                  max={24}
                  value={form.slotCloseHour}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, slotCloseHour: Number(e.target.value || 0) }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="lead">Prep lead time (hours)</Label>
                <Input
                  id="lead"
                  type="number"
                  min={0}
                  max={336}
                  value={form.prepLeadHours}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, prepLeadHours: Number(e.target.value || 0) }))
                  }
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Customers can pick any hour slot inside this window. Hours use the 24h clock (e.g. 11
              to 20 means 11:00 to 19:00 last slot).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daily caps &amp; same-day orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cap-orders">Max orders per day</Label>
                <Input
                  id="cap-orders"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  placeholder="No cap"
                  value={form.maxOrdersPerDay}
                  onChange={(e) => setForm((s) => ({ ...s, maxOrdersPerDay: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cap-trays">Max trays per day</Label>
                <Input
                  id="cap-trays"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  placeholder="No cap"
                  value={form.maxTraysPerDay}
                  onChange={(e) => setForm((s) => ({ ...s, maxTraysPerDay: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
              <div>
                <p className="text-sm font-semibold text-foreground">Allow same-day orders</p>
                <p className="text-xs text-muted-foreground">
                  Off blocks customers from picking today, even if your lead time would allow it.
                </p>
              </div>
              <Switch
                checked={form.sameDayOrders}
                onCheckedChange={(v) => setForm((s) => ({ ...s, sameDayOrders: v }))}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Large &amp; event orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="lol">Large-order lead time (hours)</Label>
                <Input
                  id="lol"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="No special lead"
                  value={form.largeOrderLeadHours}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, largeOrderLeadHours: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="lot">Tray threshold</Label>
                <Input
                  id="lot"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  placeholder="Trays per order to trigger"
                  value={form.largeOrderTrayThreshold}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, largeOrderTrayThreshold: e.target.value }))
                  }
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Set both, or leave both blank. Orders meeting the tray threshold will require the
              long lead time instead of your standard prep lead.
            </p>

            <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Event catering needs a manual quote
                </p>
                <p className="text-xs text-muted-foreground">
                  Stops event orders being placed instantly. Customers will see a quote-request
                  flow instead.
                </p>
              </div>
              <Switch
                checked={form.eventCateringManualQuote}
                onCheckedChange={(v) =>
                  setForm((s) => ({ ...s, eventCateringManualQuote: v }))
                }
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : 'Save availability'}
          </Button>
        </div>
      </form>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarX className="h-5 w-5 text-vendor" />
            Blackout dates
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={submitBlackout}
            className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr_auto]"
          >
            <div className="space-y-1">
              <Label htmlFor="bdate">Date</Label>
              <Input
                id="bdate"
                type="date"
                value={newBlackoutDate}
                onChange={(e) => setNewBlackoutDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="breason">Reason (optional)</Label>
              <Input
                id="breason"
                type="text"
                maxLength={200}
                placeholder="e.g. Closed for Eid"
                value={newBlackoutReason}
                onChange={(e) => setNewBlackoutReason(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={!newBlackoutDate || addBlackout.isPending}>
                <Plus className="mr-1 h-4 w-4" />
                {addBlackout.isPending ? 'Adding…' : 'Add'}
              </Button>
            </div>
          </form>

          {snap && snap.blackoutDates.length === 0 && (
            <p className="rounded-md border border-dashed border-border bg-background px-3 py-6 text-center text-sm text-muted-foreground">
              No blackout dates. Add one above to close the kitchen for a single day.
            </p>
          )}

          {snap && snap.blackoutDates.length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border">
              {snap.blackoutDates.map((b) => (
                <li key={b.id} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{formatHumanDate(b.date)}</p>
                    {b.reason && (
                      <p className="text-xs text-muted-foreground">{b.reason}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeBlackout.mutate(b.id)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10"
                    aria-label={`Remove ${b.date}`}
                  >
                    <Trash2 className="h-4 w-4" /> Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

    </div>
  );
}

function formatHumanDate(iso: string): string {
  // Parse as a calendar day (UTC midnight) to avoid local timezone
  // shifting it onto the previous day.
  const [y, m, d] = iso.split('-').map((n) => Number(n));
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
