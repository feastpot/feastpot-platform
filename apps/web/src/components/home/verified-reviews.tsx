import { Star } from 'lucide-react';

import { getFeaturedReviews } from '@/lib/api/reviews';

/**
 * Data-driven replacement for the old hardcoded CommunityReviews component.
 *
 * Renders up to 4 real, verified reviews pulled from GET /v1/reviews/featured.
 * Reviews must be linked to a completed order (is_verified = true by default)
 * and pass moderation (auto_approved or approved) before they appear here.
 *
 * If no published reviews exist yet the component renders nothing - the
 * TrustStandard section immediately below this handles the fallback trust
 * messaging without duplicating the heading.
 */
export async function VerifiedReviews() {
  const reviews = await getFeaturedReviews();

  if (reviews.length === 0) return null;

  return (
    <section
      aria-labelledby="verified-reviews-heading"
      className="mx-auto max-w-6xl px-4 pt-14 sm:px-6 lg:px-8 lg:pt-20"
    >
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brand">
        Verified reviews
      </p>
      <h2
        id="verified-reviews-heading"
        className="mt-1 font-display text-[26px] font-black leading-tight text-charcoal sm:text-3xl"
      >
        What customers are saying
      </h2>

      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {reviews.map((review) => {
          const authorName = review.customer.firstName ?? 'Customer';
          return (
            <li
              key={review.id}
              className="flex flex-col gap-3 rounded-2xl border border-cream-deep bg-white p-5 shadow-card"
            >
              <div className="flex gap-0.5" aria-label={`${review.rating} out of 5 stars`}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={
                      i < review.rating
                        ? 'h-4 w-4 fill-plantain text-plantain'
                        : 'h-4 w-4 text-charcoal-mid/30'
                    }
                    aria-hidden
                  />
                ))}
              </div>
              <p className="font-display text-[15px] font-black leading-snug text-charcoal">
                &ldquo;{review.body}&rdquo;
              </p>
              <p className="mt-auto text-[12.5px] font-medium text-charcoal-mid">
                {authorName} &middot; {review.vendor.businessName}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
