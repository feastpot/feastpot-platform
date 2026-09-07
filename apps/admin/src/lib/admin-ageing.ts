/**
 * Shared, deterministic ageing/SLA calculation for admin queues.
 * Calendar-business-day rules use the UK operational timezone (Europe/London).
 */
export type AgeingTone = 'neutral' | 'amber' | 'red';

export interface AgeingState {
  tone: AgeingTone;
  label: string;
  deadline: string;
  breached: boolean;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const LONDON = 'Europe/London';

function validTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

interface LondonParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function londonParts(time: number): LondonParts | null {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: LONDON,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(time))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const numberPart = (name: string): number | null => {
    const value = Number(values[name]);
    return Number.isFinite(value) ? value : null;
  };
  const year = numberPart('year');
  const month = numberPart('month');
  const day = numberPart('day');
  const hour = numberPart('hour');
  const minute = numberPart('minute');
  const second = numberPart('second');
  if (
    year === null ||
    month === null ||
    day === null ||
    hour === null ||
    minute === null ||
    second === null
  )
    return null;
  return { year, month, day, hour, minute, second };
}

/** Adds business days while retaining the local Europe/London clock time. */
export function addLondonBusinessDays(origin: string, days: number): string | null {
  const originMs = validTime(origin);
  if (originMs === null) return null;
  const parts = londonParts(originMs);
  if (!parts) return null;
  let calendar = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  let added = 0;
  while (added < days) {
    calendar = new Date(calendar.getTime() + DAY);
    const weekday = calendar.getUTCDay();
    if (weekday !== 0 && weekday !== 6) added += 1;
  }
  const localAsUtc = Date.UTC(
    calendar.getUTCFullYear(),
    calendar.getUTCMonth(),
    calendar.getUTCDate(),
    parts.hour,
    parts.minute,
    parts.second,
  );
  // Resolve local London wall time, including DST offsets, without relying on
  // the browser timezone.
  let result = localAsUtc;
  for (let i = 0; i < 3; i += 1) {
    const actual = londonParts(result);
    if (!actual) return null;
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    result += localAsUtc - actualAsUtc;
  }
  return new Date(result).toISOString();
}

function duration(ms: number): string {
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h`;
  return `${Math.floor(ms / DAY)}d`;
}

/**
 * Returns null for terminal or incomplete rows. Approaching begins halfway
 * through an SLA window; an exact deadline is still within SLA.
 */
export function getAdminAgeing({
  createdAt,
  deadlineAt,
  businessDays,
  hours,
  terminal = false,
  nowMs = Date.now(),
}: {
  createdAt?: string | null;
  deadlineAt?: string | null;
  businessDays?: number;
  hours?: number;
  terminal?: boolean;
  nowMs?: number;
}): AgeingState | null {
  if (terminal) return null;
  const createdMs = validTime(createdAt);
  const providedDeadline = validTime(deadlineAt);
  const derivedDeadline =
    providedDeadline ??
    (businessDays !== undefined && createdAt
      ? validTime(addLondonBusinessDays(createdAt, businessDays))
      : null) ??
    (hours !== undefined && createdMs !== null ? createdMs + hours * HOUR : null);
  if (derivedDeadline === null) return null;
  const total = createdMs === null ? null : derivedDeadline - createdMs;
  const remaining = derivedDeadline - nowMs;
  if (remaining < 0) {
    return {
      tone: 'red',
      label: `Overdue by ${duration(-remaining)}`,
      deadline: new Date(derivedDeadline).toISOString(),
      breached: true,
    };
  }
  if (total !== null && remaining <= total / 2) {
    return {
      tone: 'amber',
      label: `Due in ${duration(remaining)}`,
      deadline: new Date(derivedDeadline).toISOString(),
      breached: false,
    };
  }
  return {
    tone: 'neutral',
    label: `Due in ${duration(remaining)}`,
    deadline: new Date(derivedDeadline).toISOString(),
    breached: false,
  };
}
