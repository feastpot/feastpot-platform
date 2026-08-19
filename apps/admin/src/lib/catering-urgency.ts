/**
 * Catering enquiry SLA and event-proximity urgency utilities.
 *
 * SLA window: 48 hours from creation.
 *   < 24 h  → neutral pill  (shows "Xh ago")
 *   24–48 h → amber pill   (shows "Xh ago")
 *   > 48 h  → red pill     (shows "Overdue by Xh/Xd")
 *
 * Event proximity flag (only when event date is present and in the future):
 *   < 7 days   → amber flag  ("Event in Nd")
 *   < 72 hours → red flag    ("Event in Nh")
 *
 * Urgency sort key: min(slaDeadline, upcomingEventDate) - ascending.
 * Past deadlines (already overdue) sort before future deadlines.
 */

export const SLA_HOURS = 48;
const SLA_MS = SLA_HOURS * 60 * 60 * 1000;
const EVENT_WARN_MS = 7 * 24 * 60 * 60 * 1000;
const EVENT_RED_MS = 72 * 60 * 60 * 1000;

export interface SlaState {
  label: string;
  tone: 'neutral' | 'amber' | 'red';
  overdue: boolean;
}

export interface EventFlag {
  label: string;
  tone: 'amber' | 'red';
}

export interface EnquiryUrgency {
  sla: SlaState;
  eventFlag: EventFlag | null;
  /** Absolute ms timestamp of earliest deadline. Sort ascending for most-urgent-first. */
  urgencyDeadlineMs: number;
}

function compactDuration(ms: number): string {
  const h = Math.floor(ms / (60 * 60 * 1000));
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function getEnquiryUrgency(
  createdAt: string,
  eventDate?: string | null,
  nowMs: number = Date.now(),
): EnquiryUrgency {
  const createdMs = new Date(createdAt).getTime();
  const ageMs = nowMs - createdMs;
  const slaDeadlineMs = createdMs + SLA_MS;
  const msUntilBreach = slaDeadlineMs - nowMs;

  // ── SLA pill ────────────────────────────────────────────────────────────
  let sla: SlaState;
  if (ageMs < 24 * 60 * 60 * 1000) {
    sla = { label: `${compactDuration(ageMs)} ago`, tone: 'neutral', overdue: false };
  } else if (msUntilBreach > 0) {
    sla = { label: `${compactDuration(ageMs)} ago`, tone: 'amber', overdue: false };
  } else {
    sla = {
      label: `Overdue by ${compactDuration(-msUntilBreach)}`,
      tone: 'red',
      overdue: true,
    };
  }

  // ── Event flag ──────────────────────────────────────────────────────────
  let eventFlag: EventFlag | null = null;
  let eventDeadlineMs = Infinity;
  if (eventDate) {
    const eventMs = new Date(eventDate).getTime();
    const msUntilEvent = eventMs - nowMs;
    if (msUntilEvent > 0 && msUntilEvent < EVENT_WARN_MS) {
      const label =
        msUntilEvent < 24 * 60 * 60 * 1000
          ? `Event in ${Math.ceil(msUntilEvent / (60 * 60 * 1000))}h`
          : `Event in ${Math.ceil(msUntilEvent / (24 * 60 * 60 * 1000))}d`;
      eventFlag = { label, tone: msUntilEvent < EVENT_RED_MS ? 'red' : 'amber' };
      eventDeadlineMs = eventMs;
    }
  }

  // ── Sort key ────────────────────────────────────────────────────────────
  // Earlier deadline = more urgent. Past deadlines (already breached) are
  // numerically smaller than future deadlines, so they sort to the top.
  const urgencyDeadlineMs = Math.min(slaDeadlineMs, eventDeadlineMs);

  return { sla, eventFlag, urgencyDeadlineMs };
}
