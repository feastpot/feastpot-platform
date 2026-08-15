import { shouldShowFeastPassCallout } from '../lib/feastpass-callout';

describe('shouldShowFeastPassCallout', () => {
  describe('when savings data is still loading / errored (undefined)', () => {
    it('hides the callout - must not flash while request is in-flight', () => {
      expect(shouldShowFeastPassCallout(299, undefined)).toBe(false);
    });
  });

  describe('when the customer is an active FeastPass member (server returns 0)', () => {
    it('hides the callout', () => {
      expect(shouldShowFeastPassCallout(299, { savingsPotentialPence: 0, orderCount: 5 })).toBe(
        false,
      );
    });

    it('hides the callout even when the order had a high service fee', () => {
      expect(shouldShowFeastPassCallout(999, { savingsPotentialPence: 0, orderCount: 20 })).toBe(
        false,
      );
    });
  });

  describe('when the order had no service fee', () => {
    it('hides the callout for non-members too', () => {
      expect(shouldShowFeastPassCallout(0, { savingsPotentialPence: 750, orderCount: 3 })).toBe(
        false,
      );
    });
  });

  describe('when the customer is a non-member who paid a service fee', () => {
    it('shows the callout', () => {
      expect(shouldShowFeastPassCallout(299, { savingsPotentialPence: 750, orderCount: 3 })).toBe(
        true,
      );
    });

    it('shows the callout even on their very first qualifying order (orderCount: 1)', () => {
      expect(shouldShowFeastPassCallout(50, { savingsPotentialPence: 50, orderCount: 1 })).toBe(
        true,
      );
    });
  });
});
