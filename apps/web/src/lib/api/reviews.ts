import { apiRequest } from './client';

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
 * - There is NO `foodQualityRating` field server-side and NO photo upload
 *   endpoint. The review form may still surface those inputs (per UI spec)
 *   but they are NOT transmitted; an inline notice tells the customer.
 */
export function createReview(input: CreateReviewInput, accessToken: string): Promise<ReviewResponse> {
  return apiRequest<ReviewResponse>('/reviews', {
    method: 'POST',
    body: input,
    accessToken,
  });
}
