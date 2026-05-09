import { BadRequestException } from '@nestjs/common';

import { MenuItemsService } from './menu-items.service';

describe('MenuItemsService allergen + tag helpers', () => {
  describe('validateAllergens', () => {
    it('accepts an empty list', () => {
      expect(MenuItemsService.validateAllergens(undefined)).toEqual([]);
      expect(MenuItemsService.validateAllergens([])).toEqual([]);
    });

    it('accepts all 14 FSA allergens', () => {
      expect(() =>
        MenuItemsService.validateAllergens([
          'celery', 'gluten', 'crustaceans', 'eggs', 'fish', 'lupin', 'milk',
          'molluscs', 'mustard', 'peanuts', 'sesame', 'soybeans', 'sulphites', 'tree_nuts',
        ]),
      ).not.toThrow();
    });

    it('rejects an unknown allergen with BadRequest containing the bad value', () => {
      try {
        MenuItemsService.validateAllergens(['gluten', 'unicorn-tears', 'eggs']);
        fail('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const body = (err as BadRequestException).getResponse() as { code: string; message: string };
        expect(body.code).toBe('INVALID_ALLERGEN');
        expect(body.message).toContain('unicorn-tears');
      }
    });
  });

  describe('validateDietaryFlags', () => {
    it('rejects unknown flag', () => {
      expect(() => MenuItemsService.validateDietaryFlags(['vegan', 'paleo'])).toThrow(BadRequestException);
    });

    it('accepts known flags', () => {
      expect(MenuItemsService.validateDietaryFlags(['vegan', 'gluten_free'])).toEqual(['vegan', 'gluten_free']);
    });
  });

  describe('buildTags', () => {
    it('encodes halal/spice/portion + dietary flags into the tags array', () => {
      const tags = MenuItemsService.buildTags({
        dietaryFlags: ['vegan', 'gluten_free'],
        isHalal: true,
        spiceLevel: 2,
        portionLabel: 'family',
      });
      expect(tags).toEqual(expect.arrayContaining(['vegan', 'gluten_free', 'halal', 'spice:2', 'portion:family']));
    });

    it('omits absent fields cleanly', () => {
      const tags = MenuItemsService.buildTags({});
      expect(tags).toEqual([]);
    });

    it('does not duplicate halal tag if both flag and dietaryFlags include it', () => {
      const tags = MenuItemsService.buildTags({ dietaryFlags: ['halal'], isHalal: true });
      expect(tags.filter((t) => t === 'halal').length).toBe(1);
    });
  });
});
