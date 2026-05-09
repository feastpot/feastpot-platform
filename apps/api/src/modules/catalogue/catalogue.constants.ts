import { ItemCategory } from '@prisma/client';

/**
 * UK Food Standards Agency 14 major allergens.
 * @see https://www.food.gov.uk/safety-hygiene/food-allergy-and-intolerance
 */
export const FSA_14_ALLERGENS = [
  'celery',
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'lupin',
  'milk',
  'molluscs',
  'mustard',
  'peanuts',
  'sesame',
  'soybeans',
  'sulphites',
  'tree_nuts',
] as const;

export type FsaAllergen = (typeof FSA_14_ALLERGENS)[number];

export const FSA_14_ALLERGEN_SET: ReadonlySet<string> = new Set(FSA_14_ALLERGENS);

export const ITEM_CATEGORIES = Object.values(ItemCategory);

export const DIETARY_FLAGS = [
  'halal',
  'vegan',
  'vegetarian',
  'gluten_free',
  'dairy_free',
] as const;

export type DietaryFlag = (typeof DIETARY_FLAGS)[number];

export const DIETARY_FLAG_SET: ReadonlySet<string> = new Set(DIETARY_FLAGS);

/** Tag prefix used to encode spiceLevel in the schema's `tags` column. */
export const SPICE_TAG_PREFIX = 'spice:';
/** Tag prefix used to encode optional portionLabel in the schema's `tags` column. */
export const PORTION_TAG_PREFIX = 'portion:';

export const STORAGE_BUCKET = 'feastpot-media';
export const MAX_IMAGES_PER_ITEM = 5;
