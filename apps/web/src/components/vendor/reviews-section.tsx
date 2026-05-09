'use client';

import { Star } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { useVendorReviews } from '@/hooks/use-vendors';

/**
 * Paginated reviews list. Loads the first page on mount; "Load more" button
 * fetches the next cursor page. Reviewer initials are rendered as a small
 * avatar circle since we deliberately don't expose full names of reviewers.
 */
export function ReviewsSection({ vendorId }: { vendorId: string }) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } =
    useVendorReviews(vendorId);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading reviews&hellip;</p>;
  }
  if (error) {
    return <p className="text-sm text-destructive">Failed to load reviews.</p>;
  }

  const reviews = data?.pages.flatMap((p) => p.data) ?? [];

  if (reviews.length === 0) {
    return <p className="text-sm text-muted-foreground">No reviews yet.</p>;
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-4">
        {reviews.map((r) => (
          <li key={r.id} className="flex gap-3 rounded-lg border border-border p-3">
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-light text-sm font-semibold text-brand-dark"
            >
              {r.customerInitials || '?'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-0.5" aria-label={`${r.rating} stars`}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={
                        i < r.rating ? 'h-4 w-4 fill-amber-400 text-amber-400' : 'h-4 w-4 text-muted-foreground/40'
                      }
                      aria-hidden
                    />
                  ))}
                </div>
                <time className="text-xs text-muted-foreground" dateTime={r.createdAt}>
                  {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                </time>
              </div>
              {r.body && <p className="mt-1 text-sm text-foreground">{r.body}</p>}
            </div>
          </li>
        ))}
      </ul>

      {hasNextPage && (
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
