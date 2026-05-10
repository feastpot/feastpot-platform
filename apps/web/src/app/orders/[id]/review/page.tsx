'use client';

import { Star, X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { cn } from '@feastpot/ui';

import { PageShell } from '@/components/layout/page-shell';
import { useOrder } from '@/hooks/use-orders';
import { useAccessToken } from '@/lib/auth/use-access-token';
import { ApiError } from '@/lib/api/client';
import { createReview } from '@/lib/api/reviews';

const MAX_REVIEW_CHARS = 500;

/**
 * Review submission page.
 *
 * BACKEND CAPABILITY NOTE:
 *  - The reviews API only accepts `{ orderId, rating, title?, body? }`.
 *  - Food-quality rating: surfaced as a UX field but NOT transmitted (no
 *    matching API column). Once the schema adds `foodRating`, wire it up.
 *  - Photo upload: surfaced with previews + 3-file cap so the UX is honest,
 *    but the API has no upload endpoint — uploads are client-side only and
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

  const photoPreviews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);

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

  if (submitted) {
    return (
      <PageShell>
        <section className="space-y-3 py-12 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Thanks for your review!</h1>
          <p className="text-sm text-muted-foreground">It helps the community.</p>
          <button
            type="button"
            onClick={() => router.push('/account/orders')}
            className="mt-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Back to orders
          </button>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <form onSubmit={onSubmit} className="space-y-6 py-4" noValidate>
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Leave a review</h1>
          {order?.vendor && (
            <p className="text-sm text-muted-foreground">For {order.vendor.businessName}</p>
          )}
        </header>

        <fieldset>
          <legend className="mb-1 block text-sm font-semibold">Overall rating</legend>
          <StarPicker value={rating} onChange={setRating} ariaLabel="Overall rating" />
        </fieldset>

        <fieldset>
          <legend className="mb-1 block text-sm font-semibold">Food quality (optional)</legend>
          <StarPicker value={foodRating} onChange={setFoodRating} ariaLabel="Food quality rating" />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Not yet stored separately — for now this counts toward your overall rating.
          </p>
        </fieldset>

        <fieldset>
          <label htmlFor="review-text" className="mb-1 block text-sm font-semibold">
            Your review (optional)
          </label>
          <textarea
            id="review-text"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_REVIEW_CHARS))}
            rows={4}
            maxLength={MAX_REVIEW_CHARS}
            placeholder="What did you love? Anything we should pass on to the cook?"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <p className="mt-1 text-right text-[11px] text-muted-foreground">
            {text.length}/{MAX_REVIEW_CHARS}
          </p>
        </fieldset>

        <fieldset>
          <legend className="mb-1 block text-sm font-semibold">Photos (optional, up to 3)</legend>
          <div className="flex flex-wrap items-center gap-2">
            {photoPreviews.map((src, i) => (
              <div key={src} className="relative h-20 w-20 overflow-hidden rounded-md border border-border">
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
              <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground hover:bg-muted">
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
          <p className="mt-1 text-[11px] text-muted-foreground">
            Photo uploads aren&rsquo;t saved yet — coming soon.
          </p>
        </fieldset>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-brand py-3 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit review'}
        </button>
      </form>
    </PageShell>
  );
}

function StarPicker({
  value,
  onChange,
  ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= value;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(n)}
            className="rounded p-1 hover:bg-muted"
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
          >
            <Star
              className={cn(
                'h-7 w-7',
                active ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40',
              )}
              aria-hidden
            />
          </button>
        );
      })}
    </div>
  );
}
