import { ItemCategory } from '@prisma/client';

import { ALLERGEN_FREE_SLUGS, ALLERGEN_FREE_SLUG_SET } from '@feastpot/config/allergens';

/**
 * UK Food Standards Agency 14 major allergens.
 * @see https://www.food.gov.uk/safety-hygiene/food-allergy-and-intolerance
 *
 * Canonical slugs are defined once in packages/config/src/allergens.ts and
 * re-exported here so the catalogue DTO, the vendor editor, and the search
 * filter all share the same source of truth.
 */
export const FSA_14_ALLERGENS = ALLERGEN_FREE_SLUGS;

export type FsaAllergen = (typeof FSA_14_ALLERGENS)[number];

export const FSA_14_ALLERGEN_SET: ReadonlySet<string> = ALLERGEN_FREE_SLUG_SET;

export const ITEM_CATEGORIES = Object.values(ItemCategory);

export const DIETARY_FLAGS = ['halal', 'vegan', 'vegetarian', 'gluten_free', 'dairy_free'] as const;

export type DietaryFlag = (typeof DIETARY_FLAGS)[number];

export const DIETARY_FLAG_SET: ReadonlySet<string> = new Set(DIETARY_FLAGS);

/** Tag prefix used to encode spiceLevel in the schema's `tags` column. */
export const SPICE_TAG_PREFIX = 'spice:';
/** Tag prefix used to encode optional portionLabel in the schema's `tags` column. */
export const PORTION_TAG_PREFIX = 'portion:';

export const STORAGE_BUCKET = 'feastpot-media';
export const MAX_IMAGES_PER_ITEM = 5;
