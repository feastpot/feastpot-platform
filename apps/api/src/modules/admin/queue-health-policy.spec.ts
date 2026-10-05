import { assessQueueHealth, type QueueHealthReading } from './queue-health-policy';

describe('queue health alert policy', () => {
  const reading: QueueHealthReading = { waiting: 1, active: 0, failed: 0, isPaused: true };
  const minute = 60_000;

  it('detects a paused queue with a backlog only after ten continuous minutes', () => {
    const first = assessQueueHealth(reading, null, 0);
    const middle = assessQueueHealth(reading, first.history, 5 * minute);
    const last = assessQueueHealth(reading, middle.history, 10 * minute);
    expect(first.noConsumer).toBe(false);
    expect(middle.noConsumer).toBe(false);
    expect(last.noConsumer).toBe(true);
  });

  it('also detects an unpaused queue that has no active consumer', () => {
    const current = { ...reading, isPaused: false };
    const first = assessQueueHealth(current, null, 0);
    const middle = assessQueueHealth(current, first.history, 5 * minute);
    expect(assessQueueHealth(current, middle.history, 10 * minute).noConsumer).toBe(true);
  });

  it.each([{ waiting: 0 }, { active: 1 }])('resets the timer on recovery: %j', (recovered) => {
    const first = assessQueueHealth(reading, null, 0);
    const middle = assessQueueHealth({ ...reading, ...recovered }, first.history, 5 * minute);
    expect(middle.history.noConsumerSince).toBeNull();
    expect(assessQueueHealth(reading, middle.history, 10 * minute).noConsumer).toBe(false);
  });

  it('does not treat missing telemetry as ten minutes of continuous inactivity', () => {
    const first = assessQueueHealth(reading, null, 0);
    expect(assessQueueHealth(reading, first.history, 10 * minute).noConsumer).toBe(false);
  });

  it('alerts above 50, not at exactly 50', () => {
    expect(assessQueueHealth({ ...reading, waiting: 50 }, null, 0).waitingAbove50).toBe(false);
    expect(assessQueueHealth({ ...reading, waiting: 51 }, null, 0).waitingAbove50).toBe(true);
  });

  it('detects a rising failure count in a fifteen-minute window', () => {
    const first = assessQueueHealth({ ...reading, failed: 4 }, null, 0);
    const rose = assessQueueHealth({ ...reading, failed: 5 }, first.history, 15 * minute);
    expect(rose.failedCountRose).toBe(true);
    expect(rose.failedWindowBaseline).toBe(4);
  });

  it('does not report old failures as a new rise or retain an expired baseline', () => {
    const first = assessQueueHealth({ ...reading, failed: 4 }, null, 0);
    expect(
      assessQueueHealth({ ...reading, failed: 4 }, first.history, minute).failedCountRose,
    ).toBe(false);
    expect(
      assessQueueHealth({ ...reading, failed: 5 }, first.history, 16 * minute).failedCountRose,
    ).toBe(false);
  });
});
