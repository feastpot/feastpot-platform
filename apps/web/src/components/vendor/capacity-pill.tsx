import type { CapacityDay } from '@/lib/api/vendors';

import { dayName } from './capacity-band';

const SLOT_NOUNS: Record<CapacityDay['capacityType'], string> = {
  family_pot: 'pots',
  party_tray: 'trays',
  meal_prep: 'meal prep slots',
  event_catering: 'catering slots',
};

interface Props {
  capacity: CapacityDay[] | undefined;
}

/**
 * T5 — single-line capacity pill for vendor cards. Same suppression rules
 * as the profile band: untouched capacity (remaining === total) renders
 * nothing; zero remaining renders the muted sold-out state, never amber;
 * everything is computed from the stored slot figures. Renders null when
 * nothing qualifies.
 */
export function CapacityPill({ capacity }: Props) {
  if (!capacity?.length) return null;
  const row = capacity.find((r) => r.remainingSlots < r.totalSlots);
  if (!row) return null;

  if (row.remainingSlots === 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold text-charcoal-mid">
        Fully booked {dayName(row.serviceDate)}
      </span>
    );
  }

  const scarce = row.remainingSlots / row.totalSlots <= 1 / 3;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        scarce ? 'bg-amber-100 text-amber-800' : 'bg-brand-light text-brand-dark'
      }`}
    >
      {row.remainingSlots} of {row.totalSlots} {dayName(row.serviceDate)}{' '}
      {SLOT_NOUNS[row.capacityType]} left
    </span>
  );
}
