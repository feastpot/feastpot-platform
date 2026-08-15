import { CapacityType } from '@prisma/client';

import { capacityTypeForItemCategories } from './vendor-capacity';

describe('capacityTypeForItemCategories', () => {
  it('maps any event item to event_catering, regardless of the rest of the cart', () => {
    expect(capacityTypeForItemCategories(['tray', 'soup', 'event'])).toBe(
      CapacityType.event_catering,
    );
  });

  it('maps tray or bundle carts (no event) to party_tray', () => {
    expect(capacityTypeForItemCategories(['soup', 'tray'])).toBe(CapacityType.party_tray);
    expect(capacityTypeForItemCategories(['bundle'])).toBe(CapacityType.party_tray);
  });

  it('maps everything else (soups, proteins, swallow, frozen, snacks) to family_pot', () => {
    expect(
      capacityTypeForItemCategories(['soup', 'protein', 'swallow', 'frozen', 'snack']),
    ).toBe(CapacityType.family_pot);
  });

  it('never produces meal_prep (reserved for the future subscription flow)', () => {
    const allKnown = ['tray', 'soup', 'protein', 'swallow', 'snack', 'frozen', 'bundle', 'event'];
    expect(capacityTypeForItemCategories(allKnown)).not.toBe(CapacityType.meal_prep);
    expect(capacityTypeForItemCategories([])).toBe(CapacityType.family_pot);
  });
});
