/**
 * Catering intake has historically stored its date as a varchar. Intake
 * documents it as YYYY-MM-DD, so do not let Date.parse guess at ambiguous
 * values such as 03/04/2026. A date-only value is a London calendar day.
 */
export function parseCateringEventDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
    ? value
    : null;
}

export function londonCalendarDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** The event remains actionable throughout its stated London calendar day. */
export function isCateringEventDatePassed(
  value: string | null | undefined,
  now = new Date(),
): boolean {
  const eventDate = parseCateringEventDate(value);
  return eventDate !== null && eventDate < londonCalendarDate(now);
}
