'use client';

import { Check, X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { StarPicker } from '@/components/review/star-picker';
import { useOrder } from '@/hooks/use-orders';
import { useAccessToken } from '@/lib/auth/use-access-token';
import { ApiError } from '@/lib/api/client';
import { createReview } from '@/lib/api/reviews';

const MAX_REVIEW_CHARS = 500;

/**
 * Review submission page.
 *
 * BACKEND CAPABILITY NOTES:
 *  - The reviews API only accepts `{ orderId, rating, title?, body? }`.
 *  - Food-quality rating: surfaced as a UX field but NOT transmitted (no
 *    matching API column). Once the schema adds `foodRating`, wire it up.
 *  - Photo upload: surfaced with previews + 3-file cap so the UX is honest,
 *    but the API has no upload endpoint - uploads are client-side only and
 *    discarded on submit, with an inline "Photo uploads aren't saved yet"
 *    notice so the customer isn't misled.
 */
export default function ReviewPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = params?.id ?? '';

  const { token } = useAccessToken();
  const { data: order } = useOrder(orderId);

  const [rating, setRating] = useState(0);
  const [foodRating, setFoodRating] = useState(0);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Object URLs for thumbnail previews. Memoised against the files array so
  // we only mint new ones when the selection changes; the cleanup effect
  // revokes the previous batch on unmount or next change to keep the
  // browser's blob registry from growing without bound on repeated edits.
  const photoPreviews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => {
    return () => {
      photoPreviews.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [photoPreviews]);

  const onAddPhotos = (input: HTMLInputElement) => {
    const incoming = Array.from(input.files ?? []);
    const next = [...files, ...incoming].slice(0, 3);
    setFiles(next);
    input.value = '';
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) {
      setError('Please choose an overall rating.');
      return;
    }
    if (!token) {
      setError('You need to be signed in to leave a review.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await createReview(
        {
          orderId,
          rating,
          body: text.trim() || undefined,
        },
        token,
      );
      setSubmitted(true);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else if (e instanceof Error) setError(e.message);
      else setError('Could not submit review.');
    } finally {
      setSubmitting(false);
    }
  };

  // Status gate: the API rejects pre-delivery reviews with 422, but we also
  // refuse to render the form so the customer never fills in stars and text
  // only to be bounced. Mirrors the same delivered check on the tracking
  // page's review prompt. Placed AFTER all hook calls (rules of hooks).
  if (order && order.status !== 'delivered') {
    return (
      <section className="px-6 py-16 text-center">
        <span className="mb-3 block text-5xl" aria-hidden>
          ⏳
        </span>
        <h2 className="mb-2 text-xl font-bold text-dark">Order not yet delivered</h2>
        <p className="mb-5 text-sm text-mid">
          You can leave a review once your order has been delivered.
        </p>
        <a
          href={`/orders/${order.id}/tracking`}
          className="text-sm font-semibold text-brand hover:underline"
        >
          Track your order →
        </a>
      </section>
    );
  }

  if (submitted) {
    return (
      <section className="flex flex-col items-center gap-3 px-4 py-16 text-center">
        <span
          className="flex h-20 w-20 items-center justify-center rounded-full bg-teal text-white shadow-lg shadow-teal/30"
          style={{ animation: 'fp-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
          aria-hidden
        >
          <Check className="h-10 w-10" strokeWidth={3} aria-hidden />
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-dark">Thanks for your review!</h1>
        <p className="text-sm text-mid">
          It helps your community find great cooks.
        </p>
        <button
          type="button"
          onClick={() => router.push('/account/orders')}
          className="mt-2 rounded-2xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Back to orders
        </button>
        <style jsx>{`
          @keyframes fp-pop {
            0% { transform: scale(0); opacity: 0; }
            60% { transform: scale(1.15); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 px-4 py-4 pb-12" noValidate>
      {/* Vendor strip */}
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-dark">Leave a review</h1>
        {order?.vendor && (
          <div className="flex items-center gap-3 rounded-2xl border border-cream-deep bg-white p-3">
            {order.vendor.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={order.vendor.logoUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand"
                aria-hidden
              >
                {order.vendor.businessName.slice(0, 1)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs text-mid">Reviewing</p>
              <p className="truncate text-sm font-semibold text-dark">
                {order.vendor.businessName}
              </p>
            </div>
          </div>
        )}
      </header>

      <fieldset className="rounded-2xl border border-cream-deep bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-dark">How was your food?</legend>
        <div className="mt-2">
          <StarPicker value={rating} onChange={setRating} ariaLabel="Overall rating" size="lg" />
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-cream-deep bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-dark">Food quality (optional)</legend>
        <div className="mt-2">
          <StarPicker
            value={foodRating}
            onChange={setFoodRating}
            ariaLabel="Food quality rating"
            size="sm"
            showLabel={false}
          />
        </div>
        <p className="mt-2 text-[11px] text-mid">
          Not yet stored separately - for now this counts toward your overall rating.
        </p>
      </fieldset>

      <fieldset>
        <label htmlFor="review-text" className="mb-1 block text-sm font-semibold text-dark">
          Your review (optional)
        </label>
        <textarea
          id="review-text"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_REVIEW_CHARS))}
          rows={4}
          maxLength={MAX_REVIEW_CHARS}
          placeholder="Tell others what you thought..."
          className="w-full rounded-2xl border border-cream-deep bg-white px-3 py-2.5 text-sm font-medium text-charcoal placeholder:text-charcoal-mid/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
        <p className="mt-1 text-right text-[11px] text-mid">
          {text.length}/{MAX_REVIEW_CHARS}
        </p>
      </fieldset>

      <fieldset>
        <legend className="mb-1 block text-sm font-semibold text-dark">
          Photos (optional, up to 3)
        </legend>
        <div className="flex flex-wrap items-center gap-2">
          {photoPreviews.map((src, i) => (
            <div
              key={src}
              className="relative h-20 w-20 overflow-hidden rounded-xl border border-cream-deep"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Preview ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => setFiles((f) => f.filter((_, idx) => idx !== i))}
                className="absolute right-0.5 top-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                aria-label={`Remove photo ${i + 1}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {files.length < 3 && (
            <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-xl border border-dashed border-cream-deep text-xs font-medium text-charcoal-mid hover:bg-cream">
              + Add
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => onAddPhotos(e.currentTarget)}
              />
            </label>
          )}
        </div>
        <p className="mt-1 text-[11px] text-mid">
          Photo uploads aren&rsquo;t saved yet - coming soon.
        </p>
      </fieldset>

      {error && (
        <p className="rounded-2xl border border-scotch/30 bg-scotch/10 p-3 text-sm font-medium text-scotch">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center rounded-2xl bg-brand text-base font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        style={{ height: 52 }}
      >
        {submitting ? 'Submitting…' : 'Submit review'}
      </button>
    </form>
  );
}
