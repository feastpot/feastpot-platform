import { apiRequest } from './client';

// ─── Featured reviews (homepage) ────────────────────────────────────────────

export interface FeaturedReview {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  createdAt: string;
  customer: { firstName: string | null };
  vendor: { businessName: string };
}

/**
 * Fetches up to 4 recent published reviews for the homepage.
 * Called from a server component - errors return an empty array so the
 * page never breaks if the API is unavailable.
 */
export async function getFeaturedReviews(): Promise<FeaturedReview[]> {
  try {
    const data = await apiRequest<{ reviews: FeaturedReview[] }>('/reviews/featured', {
      next: { revalidate: 300 },
    });
    return data.reviews;
  } catch {
    return [];
  }
}

export interface CreateReviewInput {
  orderId: string;
  rating: number; // 1–5
  title?: string;
  body?: string;
}

export interface ReviewResponse {
  id: string;
  orderId: string;
  rating: number;
  title: string | null;
  body: string | null;
  createdAt: string;
}

/**
 * BACKEND CAPABILITY NOTES:
 * - The API's `CreateReviewDto` only accepts `{ orderId, rating, title?, body? }`.
 * - There is NO `foodQualityRating` field server-side - the form may surface
 *   it but it is NOT transmitted.
 * - Photos are attached in a second step via `uploadReviewPhotos` (multipart
 *   POST /reviews/:id/photos, max 3 x 5MB, jpeg/png/webp).
 */
export function createReview(
  input: CreateReviewInput,
  accessToken: string,
): Promise<ReviewResponse> {
  return apiRequest<ReviewResponse>('/reviews', {
    method: 'POST',
    body: input,
    accessToken,
  });
}

/**
 * Attach photos to a just-created review. Uses raw fetch (not apiRequest)
 * because the body is multipart/form-data - the browser must set the
 * boundary header itself.
 */
export async function uploadReviewPhotos(
  reviewId: string,
  files: File[],
  accessToken: string,
): Promise<{ id: string; photoUrls: string[] }> {
  const { API_URL } = await import('@/lib/env');
  const form = new FormData();
  for (const f of files) form.append('photos', f);
  const res = await fetch(`${API_URL}/v1/reviews/${encodeURIComponent(reviewId)}/photos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (body as { message?: string } | null)?.message ?? `Photo upload failed (${res.status})`;
    throw new Error(msg);
  }
  return body as { id: string; photoUrls: string[] };
}
