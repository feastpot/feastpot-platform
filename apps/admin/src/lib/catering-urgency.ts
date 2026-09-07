/**
 * Catering enquiry SLA and event-proximity urgency utilities.
 *
 * SLA window: one Europe/London business day from creation.
 *
 * Event proximity flag (only when event date is present and in the future):
 *   < 7 days   → amber flag  ("Event in Nd")
 *   < 72 hours → red flag    ("Event in Nh")
 *
 * Urgency sort key: min(slaDeadline, upcomingEventDate) - ascending.
 * Past deadlines (already overdue) sort before future deadlines.
 */

import { addLondonBusinessDays, getAdminAgeing } from './admin-ageing';

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

export function getEnquiryUrgency(
  createdAt: string,
  eventDate?: string | null,
  nowMs: number = Date.now(),
  terminal = false,
): EnquiryUrgency {
  const slaDeadlineMs = new Date(addLondonBusinessDays(createdAt, 1) ?? createdAt).getTime();

  // ── SLA pill ────────────────────────────────────────────────────────────
  const ageing = getAdminAgeing({
    createdAt,
    deadlineAt: new Date(slaDeadlineMs).toISOString(),
    nowMs,
    terminal,
  });
  const sla: SlaState = ageing
    ? { label: ageing.label, tone: ageing.tone, overdue: ageing.breached }
    : { label: 'SLA unavailable', tone: 'neutral', overdue: false };

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
