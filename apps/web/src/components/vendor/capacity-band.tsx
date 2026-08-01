'use client';

import { CalendarClock, Clock, PackageOpen } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { CapacityDay } from '@/lib/api/vendors';

/**
 * T4 — "This week's capacity" band on the vendor profile.
 *
 * Every figure is computed from the API's totalSlots / slotsTaken /
 * remainingSlots / preorderCutoffAt — no invented urgency, no fabricated
 * percentages. Suppression rules (enforced in code):
 *   - remainingSlots === totalSlots → the item renders nothing (untouched
 *     capacity is not "scarcity").
 *   - remainingSlots === 0 → muted "Fully booked for this date", never amber.
 *   - countdown only when the cutoff is within 72 hours; otherwise the plain
 *     day + time. The countdown only ever counts DOWN (recomputed from the
 *     fixed cutoff timestamp) and disappears once the cutoff passes — it can
 *     never reset, loop or restart.
 */

const SLOT_NOUNS: Record<CapacityDay['capacityType'], string> = {
  family_pot: 'pots',
  party_tray: 'trays',
  meal_prep: 'meal prep slots',
  event_catering: 'catering slots',
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function dayName(serviceDate: string): string {
  return DAY_NAMES[new Date(`${serviceDate}T00:00:00.000Z`).getUTCDay()] ?? serviceDate;
}

function formatCutoffPlain(iso: string): string {
  const d = new Date(iso);
  const day = DAY_NAMES[d.getDay()];
  let hours = d.getHours();
  const mins = d.getMinutes();
  const suffix = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;
  return `Pre-orders close ${day} at ${hours}${mins > 0 ? `:${String(mins).padStart(2, '0')}` : ''}${suffix}`;
}

const HOUR_MS = 60 * 60 * 1000;
const COUNTDOWN_WINDOW_MS = 72 * HOUR_MS;

function formatCountdown(msLeft: number): string {
  const totalMinutes = Math.max(0, Math.floor(msLeft / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `Pre-orders close in ${h}h ${m}m` : `Pre-orders close in ${m}m`;
}

/**
 * Live-updating (once a minute) cutoff line. With prefers-reduced-motion,
 * the value is computed once and left static — no ticking.
 */
function CutoffItem({ cutoffAt }: { cutoffAt: string }) {
  // Client-only: time-of-render and timezone-dependent text would differ
  // between the server and the browser, so we render nothing until mounted
  // (avoids hydration mismatches; the line pops in immediately on mount).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  if (now === null) return null;

  const cutoffMs = new Date(cutoffAt).getTime();
  const msLeft = cutoffMs - now;
  if (msLeft <= 0) return null; // cutoff passed — never restart a countdown

  const withinWindow = msLeft <= COUNTDOWN_WINDOW_MS;
  return (
    <li className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {withinWindow ? formatCountdown(msLeft) : formatCutoffPlain(cutoffAt)}
    </li>
  );
}

interface Props {
  capacity: CapacityDay[];
}

export function CapacityBand({ capacity }: Props) {
  const items: React.ReactNode[] = [];

  // Item 1 — remaining slots: the earliest pot/tray/meal-prep date where
  // someone has actually booked (remaining < total).
  const slotRow = capacity.find(
    (r) => r.capacityType !== 'event_catering' && r.remainingSlots < r.totalSlots,
  );
  if (slotRow) {
    if (slotRow.remainingSlots === 0) {
      items.push(
        <li
          key="slots"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-charcoal-mid"
        >
          <PackageOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Fully booked for this date
        </li>,
      );
    } else {
      // Amber only for genuine scarcity (≤ a third of totalSlots remaining,
      // derived purely from the stored figures); green otherwise.
      const scarce = slotRow.remainingSlots / slotRow.totalSlots <= 1 / 3;
      items.push(
        <li
          key="slots"
          className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
            scarce ? 'text-amber-700' : 'text-brand-dark'
          }`}
        >
          <PackageOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {slotRow.remainingSlots} of {slotRow.totalSlots} {dayName(slotRow.serviceDate)}{' '}
          {SLOT_NOUNS[slotRow.capacityType]} left
        </li>,
      );
    }
  }

  // Item 2 — earliest future pre-order cut-off.
  const cutoffRow = capacity
    .filter((r) => r.preorderCutoffAt && new Date(r.preorderCutoffAt).getTime() > Date.now())
    .sort(
      (a, b) =>
        new Date(a.preorderCutoffAt as string).getTime() -
        new Date(b.preorderCutoffAt as string).getTime(),
    )[0];
  if (cutoffRow?.preorderCutoffAt) {
    items.push(<CutoffItem key="cutoff" cutoffAt={cutoffRow.preorderCutoffAt} />);
  }

  // Item 3 — event catering slots, only once bookings have started. "This
  // month" must be literally true, so we only count rows inside the current
  // calendar month AND only render when the data window (21 days from today)
  // actually covers the rest of the month — otherwise a truthful count isn't
  // possible and we render nothing rather than a misleading one.
  const today = new Date();
  const monthPrefix = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`;
  const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
  const daysToMonthEnd = (monthEnd.getTime() - today.getTime()) / (24 * HOUR_MS);
  const cateringRows =
    daysToMonthEnd <= 21
      ? capacity.filter(
          (r) =>
            r.capacityType === 'event_catering' &&
            r.remainingSlots < r.totalSlots &&
            r.serviceDate.startsWith(monthPrefix),
        )
      : [];
  const cateringRemaining = cateringRows.reduce((sum, r) => sum + r.remainingSlots, 0);
  if (cateringRows.length > 0 && cateringRemaining > 0) {
    items.push(
      <li
        key="catering"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-dark"
      >
        <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {cateringRemaining} catering {cateringRemaining === 1 ? 'slot' : 'slots'} left this month
      </li>,
    );
  }

  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="capacity-band-heading"
      className="rounded-2xl border border-cream-deep bg-white p-4 shadow-sm"
    >
      <h2 id="capacity-band-heading" className="text-sm font-bold text-charcoal">
        This week&rsquo;s capacity
      </h2>
      <ul className="mt-2 flex flex-col gap-1.5">{items.slice(0, 3)}</ul>
    </section>
  );
}
