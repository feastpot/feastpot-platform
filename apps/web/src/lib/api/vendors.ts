import type { OrderType, VendorStatus } from '@feastpot/types';

import { apiRequest, type ApiRequestOptions } from './client';

/**
 * Mirrors the GET /v1/vendors response shape from
 * apps/api/src/modules/vendors/vendors.service.ts (`search()`).
 *
 * NOTE: the backend search response does not yet include `logoUrl`,
 * `coverImageUrl`, `fsaRating`, or `minOrderPence`. The card UI degrades
 * gracefully when these are absent. When the API adds them, just widen this
 * interface — the card will start rendering them automatically.
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
}

export interface VendorListResponse {
  data: VendorListItem[];
  nextCursor: string | null;
}

export type VendorSortBy = 'rating' | 'distance' | 'reorderRate';

export interface SearchVendorsParams {
  /** Free-text query — vendor name, description, cuisine, or dish name. */
  q?: string;
  postcode?: string;
  cuisine?: string[];
  halal?: boolean;
  orderType?: OrderType;
  communityFavourite?: boolean;
  sortBy?: VendorSortBy;
  limit?: number;
  cursor?: string;
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
 * must add. Until then, calls will 404 — exposed plainly so the bug is
 * obvious rather than silently masked by a fallback.
 */
export interface VendorProfile extends VendorListItem {
  // The full GET /v1/vendors/:id payload; widen as the API stabilises.
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

export function getVendorBySlug(
  slug: string,
  options?: Pick<ApiRequestOptions, 'next' | 'signal'>,
): Promise<VendorProfile> {
  return apiRequest<VendorProfile>(`/vendors/by-slug/${encodeURIComponent(slug)}`, options);
}

export interface VendorReview {
  id: string;
  rating: number;
  body: string | null;
  customerInitials: string;
  createdAt: string;
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
