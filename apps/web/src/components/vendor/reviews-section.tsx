'use client';

import { useVendorReviews } from '@/hooks/use-vendors';

/**
 * Paginated reviews list. Loads the first page on mount; "Load more" button
 * fetches the next cursor page. Reviewer initials are rendered as a small
 * avatar circle since we deliberately don't expose full names of reviewers.
 *
 * Brand-DNA refresh: each review is a warm-cream card with a teal-gradient
 * avatar (review = customer voice, contrast against the terracotta vendor
 * avatars elsewhere on the page), Plantain-Yellow stars, and an italic
 * pull-quote treatment for the body so the section reads like a Sunday-
 * paper testimonials column rather than a tech-app review list.
 *
 * Verification: every review on Feastpot is created against a delivered
 * order (see Reviews API), so we always render the ✓ Verified badge.
 *
 * `limit` (optional): cap visible reviews to the N most recent and HIDE the
 * "Load more" pagination button. The vendor profile passes `limit={3}` to
 * keep the page short and link out to a dedicated reviews surface later;
 * passing no limit keeps the original full-pagination behaviour for
 * standalone uses.
 */
export function ReviewsSection({
  vendorId,
  limit,
}: {
  vendorId: string;
  limit?: number;
}) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } =
    useVendorReviews(vendorId);

  if (isLoading) {
    // Skeleton mirrors the live review card layout — warm cream
    // surface, teal-gradient avatar slot, two-line quote — so the
    // section doesn't pop/reflow when data lands. 3 placeholders is
    // the same number we render at `limit={3}` from the vendor
    // profile, the only place this section currently mounts.
    return (
      <div className="space-y-2.5" aria-busy="true" aria-label="Loading reviews">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            aria-hidden="true"
            style={{
              background: '#FBF6EF',
              borderRadius: '16px',
              padding: '14px',
              border: '1px solid #F5EDE0',
            }}
          >
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
              <div
                className="animate-shimmer"
                style={{ width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0 }}
              />
              <div style={{ flex: 1 }}>
                <div
                  className="animate-shimmer"
                  style={{ height: '12px', width: '40%', borderRadius: '4px', marginBottom: '6px' }}
                />
                <div
                  className="animate-shimmer"
                  style={{ height: '10px', width: '25%', borderRadius: '4px' }}
                />
              </div>
            </div>
            <div
              className="animate-shimmer"
              style={{ height: '11px', width: '92%', borderRadius: '4px', marginBottom: '5px' }}
            />
            <div
              className="animate-shimmer"
              style={{ height: '11px', width: '78%', borderRadius: '4px' }}
            />
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    // Friendlier than "Failed to load reviews." — tells the user what
    // to do (refresh) rather than just announcing the failure.
    return (
      <p className="text-sm text-mid">Reviews unavailable — try refreshing the page.</p>
    );
  }

  const allReviews = data?.pages.flatMap((p) => p.data) ?? [];
  const reviews = typeof limit === 'number' ? allReviews.slice(0, limit) : allReviews;
  const showLoadMore = limit === undefined && hasNextPage;

  if (reviews.length === 0) {
    return (
      <p className="text-sm text-mid">
        No reviews yet — be the first to order and share what you think.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-0">
        {reviews.map((r) => {
          const safeRating = Math.max(0, Math.min(5, Math.round(r.rating)));
          return (
            <li
              key={r.id}
              style={{
                background: '#FBF6EF',
                borderRadius: '16px',
                padding: '14px',
                border: '1px solid #F5EDE0',
                marginBottom: '10px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  marginBottom: '8px',
                }}
              >
                <div
                  aria-hidden
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: 'linear-gradient(135deg, #1D9E75, #0F6E56)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: 700,
                  }}
                >
                  {r.customerInitials || 'FP'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#1C1C1A' }}>
                      {r.customerInitials || 'Customer'}
                    </span>
                    {/* Always Verified — Feastpot reviews are tied to a
                        delivered order at the API layer. */}
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 600,
                        padding: '1px 6px',
                        borderRadius: '3px',
                        background: '#FFF3CD',
                        color: '#856404',
                      }}
                    >
                      ✓ Verified
                    </span>
                  </div>
                  <div
                    aria-label={`${safeRating} out of 5 stars`}
                    style={{ color: '#F5A52A', fontSize: '11px', margin: '2px 0' }}
                  >
                    {'★'.repeat(safeRating)}
                    <span style={{ opacity: 0.3 }}>{'★'.repeat(5 - safeRating)}</span>
                  </div>
                </div>
                <time
                  dateTime={r.createdAt}
                  style={{ fontSize: '10px', color: '#5F5E5A', flexShrink: 0 }}
                >
                  {new Date(r.createdAt).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </time>
              </div>
              {r.body && (
                <p
                  style={{
                    fontSize: '12px',
                    color: '#5F5E5A',
                    fontStyle: 'italic',
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  &ldquo;{r.body}&rdquo;
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {showLoadMore && (
        <button
          type="button"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="w-full rounded-md border border-border bg-background py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more reviews'}
        </button>
      )}
    </div>
  );
}
