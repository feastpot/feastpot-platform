'use client';

import { addDays, format, isToday, isTomorrow } from 'date-fns';
import { useState } from 'react';

import { cn } from '@feastpot/ui';

export interface SlotPickerProps {
  /** Days of week the vendor delivers - 0=Sun … 6=Sat. */
  availableDays: number[];
  /** Open of delivery window, "HH:mm". */
  slotOpenTime: string;
  /** Close of delivery window, "HH:mm" (exclusive). */
  slotCloseTime: string;
  /** Hours of notice the vendor needs - slots within this window are hidden. */
  leadTimeHours: number;
  /** How many days into the future the picker offers. */
  maxAdvanceDays: number;
  /** Currently chosen slot start, or `null` for "not chosen yet". */
  value: Date | null;
  onChange: (date: Date) => void;
}

/**
 * Visual delivery-slot picker - horizontal date strip + time-pill grid.
 *
 * Why these props instead of reading vendor config directly:
 *   The vendor `DeliveryConfig` Prisma model does NOT yet expose
 *   `availableDays` / `slotOpenTime` / `slotCloseTime` / `leadTimeHours`
 *   / `maxAdvanceDays`. Today the parent passes app-wide defaults
 *   (every day, 11:00–20:00, 2h lead, 7-day window). The component is
 *   shaped this way so once the API surfaces those fields per vendor we
 *   only have to change the call site, not this file.
 */
export function SlotPicker({
  availableDays,
  slotOpenTime,
  slotCloseTime,
  leadTimeHours,
  maxAdvanceDays,
  value,
  onChange,
}: SlotPickerProps) {
  // If a value is already set externally, seed the date strip selection from
  // it so re-renders don't visually "lose" the user's pick.
  const [selectedDate, setSelectedDate] = useState<Date | null>(value);

  const today = new Date();
  const cutoff = new Date(today.getTime() + leadTimeHours * 60 * 60 * 1000);
  const dates: Date[] = [];
  for (let i = 0; i <= maxAdvanceDays; i++) {
    const d = addDays(today, i);
    if (!availableDays.includes(d.getDay())) continue;
    // For "today" we still want the chip visible - generateSlots filters
    // individual times against the lead-time cutoff.
    if (i === 0 || d > cutoff) dates.push(d);
  }

  // Build hourly pills like "11:00–12:00" between open and close.
  const generateSlots = (date: Date) => {
    // Defensive parsing - if a caller ever passes a malformed time string we
    // fall back to a no-op range rather than throwing.
    const openH = Number(slotOpenTime.split(':')[0] ?? '0');
    const closeH = Number(slotCloseTime.split(':')[0] ?? '0');
    const slots: { label: string; date: Date }[] = [];
    for (let h = openH; h < closeH; h++) {
      const slotStart = new Date(date);
      slotStart.setHours(h, 0, 0, 0);
      // Hide individual slots that violate lead time (relevant for "today").
      if (slotStart < cutoff) continue;
      slots.push({
        label: `${pad(h)}:00–${pad(h + 1)}:00`,
        date: slotStart,
      });
    }
    return slots;
  };

  const slots = selectedDate ? generateSlots(selectedDate) : [];

  return (
    <div>
      {/* Date strip */}
      {dates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-cream-deep bg-cream/50 px-3 py-3 text-sm font-medium text-charcoal-mid">
          No available slots - this vendor needs {leadTimeHours}h notice and isn&rsquo;t open
          on the next {maxAdvanceDays + 1} days.
        </p>
      ) : (
        <div className="-mx-1 flex gap-2 overflow-x-auto scrollbar-hide pb-2">
          {dates.map((d) => {
            const active = selectedDate?.toDateString() === d.toDateString();
            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => setSelectedDate(d)}
                aria-pressed={active}
                className={cn(
                  'flex shrink-0 flex-col items-center rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'border-teal bg-teal text-white'
                    : 'border-gray-200 bg-white text-dark hover:border-teal/50',
                )}
              >
                <span className="text-[10px] opacity-75">{labelTop(d)}</span>
                <span className="text-base font-bold leading-tight">{format(d, 'd')}</span>
                <span className="text-[10px] opacity-75">{format(d, 'MMM')}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Time pills */}
      {selectedDate && (
        <div className="mt-3">
          {slots.length === 0 ? (
            <p className="text-xs text-mid">
              No remaining slots on this day - try the next available date.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => {
                const active = value?.getTime() === s.date.getTime();
                return (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => onChange(s.date)}
                    aria-pressed={active}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'border-brand bg-brand text-white'
                        : 'border-gray-200 bg-white text-dark hover:border-brand/50',
                    )}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function labelTop(d: Date): string {
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'EEE');
}
