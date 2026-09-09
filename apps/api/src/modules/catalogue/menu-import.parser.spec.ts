import { parseMenuText } from './menu-import.parser';

describe('parseMenuText', () => {
  it('only accepts explicit unambiguous prices and exposes review flags', () => {
    const [priced, missing] = parseMenuText('Jollof Rice £12.50\nSuya platter - ask us');
    expect(priced).toMatchObject({ name: 'Jollof Rice', pricePence: 1250 });
    expect(priced.allergens).toEqual([]);
    expect(priced.allergensFreeFrom).toBe(false);
    expect(missing).toMatchObject({
      name: 'Suya platter - ask us',
      reviewFlags: ['missing_price', 'missing_portion'],
    });
  });

  it('never infers allergens or dietary claims from OCR text', () => {
    const [candidate] = parseMenuText('Peanut stew (contains peanuts) £8.00');
    expect(candidate).toMatchObject({ name: 'Peanut stew (contains peanuts)', pricePence: 800 });
    expect(candidate.allergens).toEqual([]);
    expect(candidate.allergensFreeFrom).toBe(false);
  });

  it('preserves and parses terminal pound prices with or without pence', () => {
    const candidates = parseMenuText('Suya £12\nJollof £12.50\nRice 12.50');
    expect(candidates.map((candidate) => candidate.pricePence)).toEqual([1200, 1250, 1250]);
    expect(candidates.map((candidate) => candidate.name)).toEqual(['Suya', 'Jollof', 'Rice']);
  });

  it('retains plausible unpriced dishes but rejects menu noise', () => {
    const candidates = parseMenuText(
      [
        'STARTERS',
        'Suya platter - ask us',
        'Call us on 020 1234 5678',
        'Nutrition: 450 kcal, protein 20g',
        'Served with rice and salad',
      ].join('\n'),
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      name: 'Suya platter - ask us',
      reviewFlags: ['missing_price', 'missing_portion'],
    });
  });

  it('caps candidates deterministically', () => {
    const candidates = parseMenuText(
      Array.from({ length: 50 }, (_, i) => `Dish ${i + 1} £${i + 1}.00`).join('\n'),
    );
    expect(candidates).toHaveLength(30);
    expect(candidates[0].name).toBe('Dish 1');
    expect(candidates[29].name).toBe('Dish 30');
  });
});
