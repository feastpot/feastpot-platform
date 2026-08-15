import type { OrderType, VendorStatus } from '@feastpot/types';

import { apiRequest, type ApiRequestOptions } from './client';

/**
 * Mirrors the GET /v1/vendors response shape from
 * apps/api/src/modules/vendors/vendors.service.ts (`search()`).
 *
 * NOTE: the backend search response does not yet include `logoUrl`,
 * `coverImageUrl`, `fsaRating`, or `minOrderPence`. The card UI degrades
 * gracefully when these are absent. When the API adds them, just widen this
 * interface - the card will start rendering them automatically.
 */
export interface VendorListItem {
  id: string;
  businessName: string;
  slug: string;
  description: string | null;
  cuisines: string[];
  status: VendorStatus;
  rating: number;
  ratingCount: number;
  createdAt: string;
  distanceKm?: number | null;
  // Optional fields the API may add later
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  fsaRating?: number | null;
  minOrderPence?: number | null;
  deliveryEtaMins?: number | null;
  communityFavourite?: boolean;
  /** FR-SRCH-001: dish names that matched the free-text query, when q is set. */
  matchedDishes?: string[];
  /** Loose city/area surfaced on the vendor card cook-identity row. */
  address?: { city?: string | null } | null;
  /** Remaining cookable slots this weekend; drives the scarcity ribbon. */
  availableSlots?: number | null;
}

export interface VendorListResponse {
  data: VendorListItem[];
  nextCursor: string | null;
}

export type VendorSortBy = 'rating' | 'distance' | 'reorderRate';

export interface SearchVendorsParams {
  /** Free-text query - vendor name, description, cuisine, or dish name. */
  q?: string;
  postcode?: string;
  cuisine?: string[];
  halal?: boolean;
  orderType?: OrderType;
  communityFavourite?: boolean;
  /** Cap results to this radius (km) from the requesting postcode. */
  maxDistanceKm?: number;
  sortBy?: VendorSortBy;
  limit?: number;
  cursor?: string;
  /**
   * Allergen-free filter. Canonical FSA 14 slugs (from packages/config/allergens).
   * A vendor is returned if it has at least one dish with a non-empty allergens
   * array that contains none of the requested allergens. AND semantics: all slugs
   * must be absent from the same dish.
   */
  allergenFree?: string[];
  /**
   * Dietary-preference filter. Accepted values: 'vegan' | 'vegetarian'.
   * Not an allergen-safety claim. Returns vendors with at least one dish
   * tagged with a matching lifestyle flag.
   */
  dietaryPreferences?: string[];
}

export function searchVendors(
  params: SearchVendorsParams,
  options?: Pick<ApiRequestOptions, 'next' | 'signal'>,
): Promise<VendorListResponse> {
  return apiRequest<VendorListResponse>('/vendors', { query: { ...params }, ...options });
}

/**
 * Vendor profile lookup.
 *
 * Backend gap: the API only exposes GET /v1/vendors/:id (UUID). The customer
 * PWA uses slugs in URLs, so this hits a `by-slug` route that the API team
 * must add. Until then, calls will 404 - exposed plainly so the bug is
 * obvious rather than silently masked by a fallback.
 */
export interface VendorProfile extends VendorListItem {
  // The full GET /v1/vendors/:id payload; widen as the API stabilises.
  /** Platform service fee in basis points (global, server-sourced at request
   *  time). Drives the exact express-checkout (Apple/Google Pay) total. */
  platformServiceFeeBps?: number;
  reorderRatePct?: number;
  approvedAt?: string | null;
  delivery?: {
    types: string[];
    localRadiusMiles: number;
    localFeePence: number;
    minOrderPence: number;
    freeDeliveryOverPence: number | null;
    postcodes: string[];
  } | null;
  menus?: VendorMenuGroup[];
  /** T005: business profile editor fields. All optional / nullable so older
   *  vendor records (pre-migration) and the storefront degrade gracefully. */
  specialities?: string[] | null;
  vendorStory?: string | null;
  featuredDishes?: string[] | null;
  socialLinks?: Record<string, string> | null;
  /** Real per-star published-review counts; sums to `ratingCount`. */
  ratingBreakdown?: { 1: number; 2: number; 3: number; 4: number; 5: number };
}

export interface VendorMenuGroup {
  id: string;
  name: string;
  items: VendorMenuItem[];
}

export interface VendorMenuItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  pricePence: number;
  servingsCount: number | null;
  preparationHours: number;
  imageUrls: string[];
  allergens: string[];
  tags: string[];
  isAvailable: boolean;
}

/**
 * Check whether a slug was once used by a vendor and where it now points.
 * Returns { newSlug } if a redirect exists, or null if the slug is unknown.
 * Used by the vendor profile page to send a 301 when someone follows an old link.
 */
export async function getVendorSlugRedirect(slug: string): Promise<{ newSlug: string } | null> {
  try {
    return await apiRequest<{ newSlug: string }>(
      `/vendors/slug-redirect/${encodeURIComponent(slug)}`,
    );
  } catch {
    return null;
  }
}

export function getVendorBySlug(
  slug: string,
  options?: Pick<ApiRequestOptions, 'next' | 'signal'> & { postcode?: string | null },
): Promise<VendorProfile> {
  const { postcode, ...rest } = options ?? {};
  return apiRequest<VendorProfile>(`/vendors/by-slug/${encodeURIComponent(slug)}`, {
    ...rest,
    query: postcode ? { postcode } : undefined,
  });
}

// ─── Trust signals + capacity (interface layer for the capacity data layer) ──

export type TrustSignalType =
  | 'food_business_registration'
  | 'hygiene_rating'
  | 'identity_check'
  | 'allergen_information'
  | 'delivery_coverage'
  | 'event_catering_experience'
  | 'reliable_orders';

export interface VerifiedTrustSignal {
  signalType: TrustSignalType;
  verifiedAt: string | null;
}

export type CapacityType = 'family_pot' | 'party_tray' | 'event_catering' | 'meal_prep';

export interface CapacityDay {
  serviceDate: string; // YYYY-MM-DD
  capacityType: CapacityType;
  totalSlots: number;
  slotsTaken: number;
  remainingSlots: number;
  preorderCutoffAt: string | null;
}

// ─── Vendor verification ─────────────────────────────────────────────────────

export type FhrsStatus = 'AWAITING_FIRST_INSPECTION' | 'RATED' | 'EXEMPT' | 'NOT_FOUND';

export type VerificationOverallState = 'VERIFIED' | 'RENEWAL_DUE' | 'SUSPENDED';

export interface VendorVerificationData {
  id: string;
  vendorId: string;
  registrationNumber: string;
  registrationAuthority: string;
  registrationConfirmedAt: string;
  fhrsRating: number | null;
  fhrsRatingCheckedAt: string | null;
  fhrsInspectionStatus: FhrsStatus;
  insuranceProvider: string | null;
  insuranceValidUntil: string | null;
  allergenTrainingHeld: boolean;
  allergenTrainingUntil: string | null;
  idVerifiedAt: string | null;
  overallState: VerificationOverallState;
  updatedAt: string;
}

/** Structured verification record for the public vendor profile. Returns null on 404. */
export async function getVendorVerification(
  vendorId: string,
  options: ApiRequestOptions = {},
): Promise<VendorVerificationData | null> {
  try {
    return await apiRequest<VendorVerificationData>(`/vendors/${vendorId}/verification`, options);
  } catch {
    return null;
  }
}

/** Verified-only trust signals for the public vendor profile. */
export function getVendorTrustSignals(
  vendorId: string,
  options: ApiRequestOptions = {},
): Promise<{ signals: VerifiedTrustSignal[] }> {
  return apiRequest<{ signals: VerifiedTrustSignal[] }>(
    `/vendors/${vendorId}/trust-signals`,
    options,
  );
}

/** Availability snapshot incl. the additive `capacity` array (21 days). */
export function getVendorCapacity(
  vendorId: string,
  options: ApiRequestOptions = {},
): Promise<{ capacity: CapacityDay[] }> {
  return apiRequest<{ capacity: CapacityDay[] }>(`/vendors/${vendorId}/availability`, options);
}

export interface VendorCardExtras {
  trustSignals: Record<string, VerifiedTrustSignal[]>;
  capacity: Record<string, CapacityDay[]>;
}

/** Batch trust signals + 7-day capacity for search-result cards (max 50 ids). */
export function getVendorCardExtras(
  vendorIds: string[],
  options: ApiRequestOptions = {},
): Promise<VendorCardExtras> {
  return apiRequest<VendorCardExtras>('/vendors/card-extras', {
    query: { ids: vendorIds.slice(0, 50).join(',') },
    ...options,
  });
}

export interface VendorReview {
  id: string;
  rating: number;
  body: string | null;
  customerInitials: string;
  createdAt: string;
  /** Customer-uploaded photos (public URLs, max 3). */
  photoUrls?: string[];
}

export interface VendorCoverage {
  vendorCount: number;
  /** Distinct postcode districts (e.g. "SW2", "E8") covered by live vendors. */
  postcodeDistricts: string[];
}

/** Aggregated live-vendor coverage, optionally filtered by cuisine. */
export function getVendorCoverage(
  cuisines?: string[],
  options?: Pick<ApiRequestOptions, 'next' | 'signal'>,
): Promise<VendorCoverage> {
  return apiRequest<VendorCoverage>('/vendors/coverage', {
    query: cuisines && cuisines.length > 0 ? { cuisine: cuisines } : undefined,
    ...options,
  });
}

export interface VendorReviewsResponse {
  data: VendorReview[];
  nextCursor: string | null;
}

export function getVendorReviews(
  vendorId: string,
  params: { cursor?: string; limit?: number } = {},
  options?: Pick<ApiRequestOptions, 'next' | 'signal'>,
): Promise<VendorReviewsResponse> {
  return apiRequest<VendorReviewsResponse>(`/vendors/${vendorId}/reviews`, {
    query: params,
    ...options,
  });
}
