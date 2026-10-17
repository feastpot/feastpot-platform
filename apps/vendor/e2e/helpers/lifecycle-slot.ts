export interface LifecycleAvailability {
  openingDays: number[];
  slotOpenHour: number;
  slotCloseHour: number;
  prepLeadHours: number;
  blackoutDates: Array<{ date: string }>;
}

/** Select fixture input without bypassing the server's checkout validation. */
export function lifecycleSlot(
  availability: LifecycleAvailability,
  itemLeadHours: number,
  now = new Date(),
): string {
  const leadHours = Math.max(48, availability.prepLeadHours, itemLeadHours) + 24;
  const earliest = new Date(now.getTime() + leadHours * 3_600_000);
  const blackouts = new Set(availability.blackoutDates.map(({ date }) => date));
  for (let offset = 0; offset < 21; offset++) {
    const candidate = new Date(
      Date.UTC(
        earliest.getUTCFullYear(),
        earliest.getUTCMonth(),
        earliest.getUTCDate() + offset,
        availability.slotOpenHour,
      ),
    );
    if (
      candidate >= earliest &&
      availability.slotOpenHour < availability.slotCloseHour &&
      availability.openingDays.includes(candidate.getUTCDay()) &&
      !blackouts.has(candidate.toISOString().slice(0, 10))
    ) {
      return candidate.toISOString();
    }
  }
  throw new Error('No lifecycle order slot found within 21 days of the required lead time.');
}
