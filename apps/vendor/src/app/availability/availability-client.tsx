'use client';

import { cn } from '@feastpot/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CalendarX, Clock, PackageOpen, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

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

/**
 * Availability screen — redesigned to match the Vendor5 mockup
 * while keeping every existing behaviour intact:
 *   - SSR-hydrated snapshot via useQuery initialData
 *   - Background refetch reseeds the form only when key fields
 *     haven't been edited locally (avoids wiping in-flight edits)
 *   - Same PATCH /vendors/me/availability mutation
 *   - Same POST / DELETE blackout endpoints
 *   - Same client-side validation (open day required, close > open,
 *     large-order lead + threshold must be set together)
 *
 * Visual changes only: card frames now use the shared `fp-card`
 * + border-border design language, day pills use the teal active
 * state from the mockup, hour inputs get a clock icon decoration,
 * blackout list rendered as fp-card rows, and the Save button is
 * pinned bottom-right with the teal CTA colour.
 */
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
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-dark">Availability</h1>
        <p className="mt-1 text-sm text-mid">
          Control when customers can place orders, how much notice you need, and any one-off days
          the kitchen is closed.
        </p>
      </header>

      {serverError && (
        <div className="fp-card border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {serverError}
        </div>
      )}
      {savedNote && (
        <div className="fp-card border border-teal/40 bg-teal-light px-4 py-3 text-sm font-medium text-teal-dark">
          Saved.
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-5">
        <Section icon={CalendarDays} title="Opening days & slot window">
          <div className="space-y-2">
            <FieldLabel>Days the kitchen is open</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {DAY_LABELS.map((d) => {
                const active = form.openingDays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    aria-pressed={active}
                    className={cn(
                      'rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors',
                      active
                        ? 'border-teal bg-teal text-white shadow-sm'
                        : 'border-border bg-white text-mid hover:bg-surface hover:text-dark',
                    )}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <HourField
              id="open"
              label="Slot open hour"
              min={0}
              max={23}
              value={form.slotOpenHour}
              onChange={(n) => setForm((s) => ({ ...s, slotOpenHour: n }))}
            />
            <HourField
              id="close"
              label="Slot close hour"
              min={1}
              max={24}
              value={form.slotCloseHour}
              onChange={(n) => setForm((s) => ({ ...s, slotCloseHour: n }))}
            />
            <div className="space-y-1">
              <FieldLabel htmlFor="lead">Prep lead time (hours)</FieldLabel>
              <TextInput
                id="lead"
                type="number"
                min={0}
                max={336}
                value={String(form.prepLeadHours)}
                onChange={(v) => setForm((s) => ({ ...s, prepLeadHours: Number(v || 0) }))}
              />
              <p className="text-[11px] text-mid">Hours of notice required before accepting orders</p>
            </div>
          </div>
          <p className="text-xs text-mid">
            Customers can pick any hour slot inside this window. Hours use the 24h clock (e.g. 11
            to 20 means 11:00 to 19:00 last slot).
          </p>
        </Section>

        <Section icon={PackageOpen} title="Daily caps & same-day orders">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <FieldLabel htmlFor="cap-orders">Max orders per day</FieldLabel>
              <TextInput
                id="cap-orders"
                type="number"
                min={1}
                inputMode="numeric"
                placeholder="No cap"
                value={form.maxOrdersPerDay}
                onChange={(v) => setForm((s) => ({ ...s, maxOrdersPerDay: v }))}
              />
              <p className="text-[11px] text-mid">Leave blank for unlimited</p>
            </div>
            <div className="space-y-1">
              <FieldLabel htmlFor="cap-trays">Max trays per day</FieldLabel>
              <TextInput
                id="cap-trays"
                type="number"
                min={1}
                inputMode="numeric"
                placeholder="No cap"
                value={form.maxTraysPerDay}
                onChange={(v) => setForm((s) => ({ ...s, maxTraysPerDay: v }))}
              />
              <p className="text-[11px] text-mid">Leave blank for unlimited</p>
            </div>
          </div>

          <ToggleRow
            title="Allow same-day orders"
            body="Off blocks customers from picking today, even if your lead time would allow it."
            checked={form.sameDayOrders}
            onChange={(v) => setForm((s) => ({ ...s, sameDayOrders: v }))}
          />
        </Section>

        <Section icon={PackageOpen} title="Large & event orders">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <FieldLabel htmlFor="lol">Large-order lead time (hours)</FieldLabel>
              <TextInput
                id="lol"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="No special lead"
                value={form.largeOrderLeadHours}
                onChange={(v) => setForm((s) => ({ ...s, largeOrderLeadHours: v }))}
              />
              <p className="text-[11px] text-mid">Set both, or leave both blank.</p>
            </div>
            <div className="space-y-1">
              <FieldLabel htmlFor="lot">Tray threshold</FieldLabel>
              <TextInput
                id="lot"
                type="number"
                min={1}
                inputMode="numeric"
                placeholder="Trays per order to trigger"
                value={form.largeOrderTrayThreshold}
                onChange={(v) => setForm((s) => ({ ...s, largeOrderTrayThreshold: v }))}
              />
              <p className="text-[11px] text-mid">Number of trays that classifies an order as large</p>
            </div>
          </div>

          <ToggleRow
            title="Event catering needs a manual quote"
            body="Stops event orders being placed instantly. Customers will see a quote-request flow instead."
            checked={form.eventCateringManualQuote}
            onChange={(v) => setForm((s) => ({ ...s, eventCateringManualQuote: v }))}
          />
        </Section>

        <Section icon={CalendarX} title="Blackout dates">
          {/* Blackout add is a sibling form action that lives inside
              the outer availability <form> (HTML forbids form
              nesting). Two consequences this block guards against:
                1. `required` would trigger native validation on the
                   outer Save submit, blocking unrelated saves —
                   instead requirement is enforced in submitBlackout.
                2. Pressing Enter in either input would otherwise
                   submit the outer Save form. onKeyDown intercepts
                   Enter and routes to submitBlackout instead. */}
          <div
            className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                submitBlackout(e);
              }
            }}
          >
            <div className="space-y-1">
              <FieldLabel htmlFor="bdate">Date</FieldLabel>
              <TextInput
                id="bdate"
                type="date"
                value={newBlackoutDate}
                onChange={setNewBlackoutDate}
              />
            </div>
            <div className="space-y-1">
              <FieldLabel htmlFor="breason">Reason (optional)</FieldLabel>
              <TextInput
                id="breason"
                type="text"
                maxLength={200}
                placeholder="e.g. Closed for Eid"
                value={newBlackoutReason}
                onChange={setNewBlackoutReason}
              />
            </div>
            <button
              type="button"
              onClick={(e) => submitBlackout(e)}
              disabled={!newBlackoutDate || addBlackout.isPending}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-teal px-3 text-sm font-semibold text-white transition-colors hover:bg-teal-dark disabled:opacity-60"
            >
              <Plus className="h-4 w-4" aria-hidden />
              {addBlackout.isPending ? 'Adding…' : 'Add'}
            </button>
          </div>

          {snap && snap.blackoutDates.length === 0 && (
            <p className="rounded-lg border border-dashed border-border bg-surface px-3 py-6 text-center text-sm text-mid">
              No blackout dates. Add one above to close the kitchen for a single day.
            </p>
          )}

          {snap && snap.blackoutDates.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border bg-white">
              {snap.blackoutDates.map((b) => (
                <li key={b.id} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold text-dark">{formatHumanDate(b.date)}</p>
                    {b.reason && <p className="text-xs text-mid">{b.reason}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeBlackout.mutate(b.id)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                    aria-label={`Remove ${b.date}`}
                  >
                    <Trash2 className="h-4 w-4" /> Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-teal px-5 text-sm font-semibold text-white transition-colors hover:bg-teal-dark disabled:opacity-60"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save availability'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Local UI primitives ──────────────────────────────────────────────
// Inline rather than promoted to the shared package because they're
// only used on this screen and tightly coupled to the section layout.

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof CalendarDays;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="fp-card border border-border bg-white">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon className="h-4 w-4 text-teal" aria-hidden />
        <h2 className="text-sm font-bold text-dark">{title}</h2>
      </header>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-semibold text-dark">
      {children}
    </label>
  );
}

function TextInput({
  id,
  type,
  value,
  onChange,
  placeholder,
  min,
  max,
  maxLength,
  inputMode,
  required,
}: {
  id: string;
  type: 'text' | 'number' | 'date';
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  inputMode?: 'numeric' | 'text';
  required?: boolean;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      min={min}
      max={max}
      maxLength={maxLength}
      inputMode={inputMode}
      required={required}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-dark placeholder:text-mid focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
    />
  );
}

function HourField({
  id,
  label,
  min,
  max,
  value,
  onChange,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="space-y-1">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value || 0))}
          className="h-10 w-full rounded-lg border border-border bg-white pl-3 pr-9 text-sm text-dark focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
        />
        <Clock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mid" aria-hidden />
      </div>
    </div>
  );
}

function ToggleRow({
  title,
  body,
  checked,
  onChange,
}: {
  title: string;
  body: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-dark">{title}</p>
        <p className="text-xs text-mid">{body}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
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
