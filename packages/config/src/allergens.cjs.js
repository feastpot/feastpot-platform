'use strict';
// CJS runtime entry for @feastpot/config/allergens.
// Generated from allergens.ts - keep in sync when allergen list changes.
const ALLERGEN_FREE_SLUGS = [
  'celery',
  'cereals-containing-gluten',
  'crustaceans',
  'eggs',
  'fish',
  'lupin',
  'milk',
  'molluscs',
  'mustard',
  'nuts',
  'peanuts',
  'sesame',
  'soya',
  'sulphur-dioxide',
];

const ALLERGEN_FREE_SLUG_SET = new Set(ALLERGEN_FREE_SLUGS);

const DIETARY_PREFERENCE_SLUGS = ['vegan', 'vegetarian'];

const DIETARY_PREFERENCE_SLUG_SET = new Set(DIETARY_PREFERENCE_SLUGS);

const ALLERGEN_DISCLAIMER_FULL =
  'Allergen filters show dishes that vendors have declared free from the selected allergens. ' +
  'This information is provided by vendors and is not verified by Feastpot. ' +
  'It is not a guarantee. ' +
  'If you have a food allergy or intolerance, always confirm directly with the vendor before ordering. ' +
  'Kitchens handle many ingredients and cross-contamination can occur.';

const ALLERGEN_DISCLAIMER_SHORT =
  'Vendor-declared, not verified by Feastpot. Always confirm with the vendor.';

exports.ALLERGEN_FREE_SLUGS = ALLERGEN_FREE_SLUGS;
exports.ALLERGEN_FREE_SLUG_SET = ALLERGEN_FREE_SLUG_SET;
exports.DIETARY_PREFERENCE_SLUGS = DIETARY_PREFERENCE_SLUGS;
exports.DIETARY_PREFERENCE_SLUG_SET = DIETARY_PREFERENCE_SLUG_SET;
exports.ALLERGEN_DISCLAIMER_FULL = ALLERGEN_DISCLAIMER_FULL;
exports.ALLERGEN_DISCLAIMER_SHORT = ALLERGEN_DISCLAIMER_SHORT;
