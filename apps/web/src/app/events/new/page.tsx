'use client';

import { Button, Input } from '@feastpot/ui';
import { useRouter } from 'next/navigation';
import { type FormEvent, useMemo, useState } from 'react';

import { PageShell } from '@/components/layout/page-shell';
import { useCreateEventEnquiry } from '@/hooks/use-event-enquiries';
import { ApiError } from '@/lib/api/client';

const CUISINE_OPTS = ['Nigerian', 'Ghanaian', 'Jamaican', 'Caribbean', 'Other'];
const DIET_OPTS = ['Halal', 'Vegan', 'Vegetarian', 'Other'];
const EVENT_TYPES = ['wedding', 'birthday', 'corporate', 'naming-ceremony', 'funeral', 'other'];

const fieldLabel = 'mb-1 block text-sm font-medium';
const textareaCls =
  'block w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';

export default function NewEventEnquiryPage() {
  const router = useRouter();
  const create = useCreateEventEnquiry();

  const minDate = useMemo(() => {
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  }, []);

  const [eventType, setEventType] = useState('wedding');
  const [eventDate, setEventDate] = useState(minDate);
  const [guestCount, setGuestCount] = useState(50);
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [dietary, setDietary] = useState<string[]>([]);
  const [postcode, setPostcode] = useState('');
  const [budgetPounds, setBudgetPounds] = useState('');
  const [notes, setNotes] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const toggle = (set: string[], setSet: (v: string[]) => void, v: string) =>
    setSet(set.includes(v) ? set.filter((x) => x !== v) : [...set, v]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError(null);
    if (!postcode.trim()) { setServerError('Postcode is required'); return; }
    if (guestCount < 10) { setServerError('Minimum 10 guests'); return; }
    try {
      const created = await create.mutateAsync({
        eventType,
        eventDate: new Date(eventDate).toISOString(),
        guestCount: Number(guestCount),
        cuisines,
        dietary,
        postcode: postcode.trim().toUpperCase(),
        budgetPence: budgetPounds ? Math.round(parseFloat(budgetPounds) * 100) : undefined,
        notes: notes || undefined,
      });
      setSuccess(true);
      router.push(`/events/${created.id}`);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  }

  return (
    <PageShell>
      <header className="py-4">
        <h1 className="text-xl font-semibold">Plan an event</h1>
        <p className="text-sm text-muted-foreground">Send a brief — vendors will quote within 24 hours.</p>
      </header>

      {success && (
        <p className="mb-3 rounded border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-900">
          We&apos;re finding vendors for you!
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className={fieldLabel}>Event type</span>
          <select
            className={textareaCls}
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
          >
            {EVENT_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
          </select>
        </label>

        <label className="block">
          <span className={fieldLabel}>Event date</span>
          <Input type="date" min={minDate} value={eventDate} onChange={(e) => setEventDate(e.target.value)} required />
          <span className="mt-1 block text-xs text-muted-foreground">Minimum 7 days from today.</span>
        </label>

        <label className="block">
          <span className={fieldLabel}>Estimated guest count</span>
          <Input type="number" min={10} value={guestCount} onChange={(e) => setGuestCount(Number(e.target.value))} required />
        </label>

        <fieldset>
          <legend className="text-sm font-medium">Cuisine preferences</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {CUISINE_OPTS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggle(cuisines, setCuisines, c)}
                className={`rounded-full border px-3 py-1 text-xs ${cuisines.includes(c) ? 'border-foreground bg-foreground text-background' : 'border-input'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium">Dietary requirements</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {DIET_OPTS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggle(dietary, setDietary, d)}
                className={`rounded-full border px-3 py-1 text-xs ${dietary.includes(d) ? 'border-foreground bg-foreground text-background' : 'border-input'}`}
              >
                {d}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className={fieldLabel}>Delivery postcode</span>
          <Input value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="e.g. SW1A 1AA" required />
        </label>

        <label className="block">
          <span className={fieldLabel}>Approximate budget (£, optional)</span>
          <Input type="number" step="0.01" min="0" value={budgetPounds} onChange={(e) => setBudgetPounds(e.target.value)} />
        </label>

        <label className="block">
          <span className={fieldLabel}>Additional notes</span>
          <textarea
            className={textareaCls}
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any service style, allergies, venue notes…"
          />
        </label>

        {serverError && (
          <p className="rounded border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
            {serverError}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={create.isPending}>
          {create.isPending ? 'Sending…' : 'Send enquiry'}
        </Button>
      </form>
    </PageShell>
  );
}
