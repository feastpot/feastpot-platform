/**
 * Canonical allergen and dietary-preference slugs for the Feastpot search API.
 *
 * Single source of truth consumed by:
 *   - the customer-facing filter UI (apps/web)
 *   - the API query DTO validation (apps/api SearchVendorsDto)
 *   - the SQL predicate in vendors.repository.ts
 *   - the vendor menu-item catalogue (apps/api catalogue.constants.ts)
 *
 * FSA 14 major allergens: Annex II of retained EU Regulation 1169/2011 /
 * Food Information Regulations 2014 (UK).
 *
 * Adding or renaming a value here is a BREAKING CHANGE: it must be
 * accompanied by a Prisma migration that normalises existing MenuItem.allergens
 * rows. The drift guard in apps/api/src/platform-facts.spec.ts will fail CI
 * if the count changes without a corresponding schema update.
 */
export const ALLERGEN_FREE_SLUGS = [
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
] as const;

export type AllergenFreeSlug = (typeof ALLERGEN_FREE_SLUGS)[number];

/** O(1) membership guard used in DTO validation and repository. */
export const ALLERGEN_FREE_SLUG_SET: ReadonlySet<string> = new Set(ALLERGEN_FREE_SLUGS);

/**
 * Lifestyle dietary-preference slugs accepted by GET /v1/vendors.
 *
 * These are NOT allergen-absence claims. They reflect vendor-declared
 * dietary-suitability flags stored in MenuItem.tags.
 *
 * "gluten-free" and "dairy-free" are expressed via allergenFree
 * (cereals-containing-gluten and milk respectively), NOT here.
 */
export const DIETARY_PREFERENCE_SLUGS = ['vegan', 'vegetarian'] as const;

export type DietaryPreferenceSlug = (typeof DIETARY_PREFERENCE_SLUGS)[number];

export const DIETARY_PREFERENCE_SLUG_SET: ReadonlySet<string> = new Set(DIETARY_PREFERENCE_SLUGS);

/**
 * Full legal disclaimer required on every surface that presents allergen
 * filters to customers. Do not shorten or reword this text.
 */
export const ALLERGEN_DISCLAIMER_FULL =
  'Allergen filters show dishes that vendors have declared free from the selected allergens. ' +
  'This information is provided by vendors and is not verified by Feastpot. ' +
  'It is not a guarantee. ' +
  'If you have a food allergy or intolerance, always confirm directly with the vendor before ordering. ' +
  'Kitchens handle many ingredients and cross-contamination can occur.';

/**
 * Short inline disclaimer shown beside the allergen filter controls.
 */
export const ALLERGEN_DISCLAIMER_SHORT =
  'Vendor-declared, not verified by Feastpot. Always confirm with the vendor.';
