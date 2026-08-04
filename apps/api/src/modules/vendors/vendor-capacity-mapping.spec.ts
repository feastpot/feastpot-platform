import { CapacityType, ItemCategory } from '@prisma/client';

import { capacityTypeForItemCategories } from './vendor-capacity';

describe('capacityTypeForItemCategories', () => {
  it('maps any event item to event_catering, regardless of the rest of the cart', () => {
    expect(
      capacityTypeForItemCategories([ItemCategory.tray, ItemCategory.soup, ItemCategory.event]),
    ).toBe(CapacityType.event_catering);
  });

  it('maps tray or bundle carts (no event) to party_tray', () => {
    expect(capacityTypeForItemCategories([ItemCategory.soup, ItemCategory.tray])).toBe(
      CapacityType.party_tray,
    );
    expect(capacityTypeForItemCategories([ItemCategory.bundle])).toBe(CapacityType.party_tray);
  });

  it('maps everything else (soups, proteins, swallow, frozen, snacks) to family_pot', () => {
    expect(
      capacityTypeForItemCategories([
        ItemCategory.soup,
        ItemCategory.protein,
        ItemCategory.swallow,
        ItemCategory.frozen,
        ItemCategory.snack,
      ]),
    ).toBe(CapacityType.family_pot);
  });

  it('never produces meal_prep (reserved for the future subscription flow)', () => {
    const all = Object.values(ItemCategory);
    expect(capacityTypeForItemCategories(all)).not.toBe(CapacityType.meal_prep);
    expect(capacityTypeForItemCategories([])).toBe(CapacityType.family_pot);
  });
});
