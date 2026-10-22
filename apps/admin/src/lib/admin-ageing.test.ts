import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addLondonBusinessDays, getAdminAgeing } from './admin-ageing';
import { getEnquiryUrgency } from './catering-urgency';

describe('admin ageing', () => {
  it('keeps midweek triage fixtures away from the halfway warning boundary and sorts overdue first', () => {
    const nowMs = Date.parse('2026-10-07T12:00:00Z');
    const urgency = (hoursAgo: number) =>
      getEnquiryUrgency(new Date(nowMs - hoursAgo * 3_600_000).toISOString(), null, nowMs);
    assert.strictEqual(urgency(6).sla.tone, 'neutral');
    assert.strictEqual(urgency(12).sla.tone, 'amber');
    assert.strictEqual(urgency(60).sla.tone, 'red');
    assert.ok(urgency(60).urgencyDeadlineMs < urgency(6).urgencyDeadlineMs);
  });
  it('uses London business days over a weekend', () => {
    assert.strictEqual(
      addLondonBusinessDays('2026-01-02T10:00:00.000Z', 1),
      '2026-01-05T10:00:00.000Z',
    );
  });
  it('keeps an exact deadline within SLA and breaches after it', () => {
    const exact = getAdminAgeing({
      createdAt: '2026-01-01T00:00:00Z',
      deadlineAt: '2026-01-02T00:00:00Z',
      nowMs: Date.parse('2026-01-02T00:00:00Z'),
    });
    assert.strictEqual(exact?.tone, 'amber');
    assert.strictEqual(
      getAdminAgeing({
        createdAt: '2026-01-01T00:00:00Z',
        deadlineAt: '2026-01-02T00:00:00Z',
        nowMs: Date.parse('2026-01-02T00:00:01Z'),
      })?.tone,
      'red',
    );
  });
  it('does not age terminal or timestamp-less rows', () => {
    assert.strictEqual(
      getAdminAgeing({ terminal: true, createdAt: '2026-01-01T00:00:00Z', hours: 24 }),
      null,
    );
    assert.strictEqual(getAdminAgeing({ hours: 24 }), null);
  });
});
