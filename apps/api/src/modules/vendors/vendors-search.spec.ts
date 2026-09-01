/**
 * Unit tests for the allergenFree and dietaryPreferences filter logic.
 *
 * These tests validate the DTO-level constraints. Repository-level SQL
 * behaviour is tested via integration (db:test) and E2E suites; here we
 * assert on the validation rules that guard every request before it
 * reaches the database.
 */
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { SearchVendorsDto } from './dto/search-vendors.dto';
import { normalisePostcodePrefix } from './vendors.repository';

describe('normalisePostcodePrefix', () => {
  it('extracts a three-character outward code from a full postcode', () => {
    expect(normalisePostcodePrefix('E16 3BZ')).toBe('E16');
  });

  it('extracts four-character outward codes without truncating them', () => {
    expect(normalisePostcodePrefix('EC1A 1BB')).toBe('EC1A');
  });

  it('supports outward-only, mixed-case, and whitespace variants', () => {
    expect(normalisePostcodePrefix(' sw1x ')).toBe('SW1X');
    expect(normalisePostcodePrefix('M1')).toBe('M1');
  });

  it('does not include the inward code in a three-character outward code', () => {
    expect(normalisePostcodePrefix('E16 3BZ')).not.toBe('E163');
  });

  it('returns null when no UK outward code can be extracted', () => {
    expect(normalisePostcodePrefix('not a postcode')).toBeNull();
  });
});

describe('SearchVendorsDto - allergenFree', () => {
  it('accepts a single valid slug', async () => {
    const dto = plainToInstance(SearchVendorsDto, { allergenFree: 'milk' });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'allergenFree')).toHaveLength(0);
    expect(dto.allergenFree).toEqual(['milk']);
  });

  it('accepts multiple comma-separated slugs and normalises to array', async () => {
    const dto = plainToInstance(SearchVendorsDto, { allergenFree: 'nuts,peanuts' });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'allergenFree')).toHaveLength(0);
    expect(dto.allergenFree).toEqual(['nuts', 'peanuts']);
  });

  it('accepts the full cereals-containing-gluten slug', async () => {
    const dto = plainToInstance(SearchVendorsDto, {
      allergenFree: 'cereals-containing-gluten',
    });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'allergenFree')).toHaveLength(0);
  });

  it('rejects old non-canonical slug "gluten" with a 400-class error', async () => {
    const dto = plainToInstance(SearchVendorsDto, { allergenFree: 'gluten' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'allergenFree')).toBe(true);
  });

  it('rejects old non-canonical slug "tree_nuts"', async () => {
    const dto = plainToInstance(SearchVendorsDto, { allergenFree: 'tree_nuts' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'allergenFree')).toBe(true);
  });

  it('rejects unknown slug "shellfish"', async () => {
    const dto = plainToInstance(SearchVendorsDto, { allergenFree: 'shellfish' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'allergenFree')).toBe(true);
  });

  it('accepts all 14 canonical slugs together', async () => {
    const all =
      'celery,cereals-containing-gluten,crustaceans,eggs,fish,lupin,milk,molluscs,mustard,nuts,peanuts,sesame,soya,sulphur-dioxide';
    const dto = plainToInstance(SearchVendorsDto, { allergenFree: all });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'allergenFree')).toHaveLength(0);
    expect(dto.allergenFree).toHaveLength(14);
  });

  it('is optional - omitting it leaves the field undefined', async () => {
    const dto = plainToInstance(SearchVendorsDto, {});
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'allergenFree')).toHaveLength(0);
    expect(dto.allergenFree).toBeUndefined();
  });
});

describe('SearchVendorsDto - dietaryPreferences', () => {
  it('accepts "vegan"', async () => {
    const dto = plainToInstance(SearchVendorsDto, { dietaryPreferences: 'vegan' });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'dietaryPreferences')).toHaveLength(0);
    expect(dto.dietaryPreferences).toEqual(['vegan']);
  });

  it('accepts "vegetarian"', async () => {
    const dto = plainToInstance(SearchVendorsDto, { dietaryPreferences: 'vegetarian' });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'dietaryPreferences')).toHaveLength(0);
  });

  it('accepts both together', async () => {
    const dto = plainToInstance(SearchVendorsDto, { dietaryPreferences: 'vegan,vegetarian' });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'dietaryPreferences')).toHaveLength(0);
    expect(dto.dietaryPreferences).toHaveLength(2);
  });

  it('rejects "gluten-free" (allergen concern, not a dietary-preference slug)', async () => {
    const dto = plainToInstance(SearchVendorsDto, { dietaryPreferences: 'gluten-free' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'dietaryPreferences')).toBe(true);
  });

  it('rejects "halal" (controlled separately via the halal param)', async () => {
    const dto = plainToInstance(SearchVendorsDto, { dietaryPreferences: 'halal' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'dietaryPreferences')).toBe(true);
  });

  it('is optional - omitting it leaves the field undefined', async () => {
    const dto = plainToInstance(SearchVendorsDto, {});
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'dietaryPreferences')).toHaveLength(0);
    expect(dto.dietaryPreferences).toBeUndefined();
  });
});

describe('SearchVendorsDto - combined allergenFree + dietaryPreferences', () => {
  it('accepts both simultaneously', async () => {
    const dto = plainToInstance(SearchVendorsDto, {
      allergenFree: 'milk,eggs',
      dietaryPreferences: 'vegan',
    });
    const errors = await validate(dto);
    expect(
      errors.filter((e) => ['allergenFree', 'dietaryPreferences'].includes(e.property)),
    ).toHaveLength(0);
    expect(dto.allergenFree).toEqual(['milk', 'eggs']);
    expect(dto.dietaryPreferences).toEqual(['vegan']);
  });

  it('accepts allergenFree combined with halal and distance params', async () => {
    const dto = plainToInstance(SearchVendorsDto, {
      allergenFree: 'nuts,peanuts',
      halal: 'true',
      maxDistanceKm: '5',
    });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'allergenFree')).toHaveLength(0);
    expect(dto.allergenFree).toEqual(['nuts', 'peanuts']);
    expect(dto.halal).toBe(true);
  });
});
