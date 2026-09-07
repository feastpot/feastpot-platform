import {
  isCateringEventDatePassed,
  londonCalendarDate,
  parseCateringEventDate,
} from './catering-event-date';

describe('catering event-date parsing', () => {
  it('accepts only unambiguous, real ISO calendar dates', () => {
    expect(parseCateringEventDate('2026-02-28')).toBe('2026-02-28');
    expect(parseCateringEventDate('2026-02-29')).toBeNull();
    expect(parseCateringEventDate('28/02/2026')).toBeNull();
    expect(parseCateringEventDate('2026-02-28T00:00:00Z')).toBeNull();
  });

  it('uses Europe/London calendar days rather than UTC boundaries', () => {
    // This is 00:30 BST on 30 March although it is still 29 March in UTC.
    const now = new Date('2026-03-29T23:30:00.000Z');
    expect(londonCalendarDate(now)).toBe('2026-03-30');
    expect(isCateringEventDatePassed('2026-03-29', now)).toBe(true);
    expect(isCateringEventDatePassed('2026-03-30', now)).toBe(false);
  });
});
