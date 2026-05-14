'use client';

import { MapPin, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

import { writeStoredPostcode } from '@/lib/postcode';

/**
 * Sticky confirmation chip shown above the vendor results that reminds the
 * customer which postcode they are searching from. Reads `?postcode=` from
 * the URL — the page already treats the URL as the source of truth for
 * filters, so we just mirror that here. Renders nothing when the param is
 * absent so direct visits to /vendors stay clean.
 *
 * The "Change" affordance clears the localStorage preference AND routes
 * back to the homepage hero, which is the canonical entry point for
 * picking a new postcode. Without the storage clear the vendors page
 * would just re-hydrate the old postcode from storage on the next
 * visit (see /vendors page useEffect), defeating the user's intent.
 */
export function PostcodeChip() {
  const params = useSearchParams();
  const router = useRouter();
  const postcode = params?.get('postcode');

  if (!postcode) return null;

  const handleChange = () => {
    writeStoredPostcode(null);
    router.push('/');
  };

  return (
    <div className="sticky top-[56px] z-30 -mx-4 border-b border-border bg-background/90 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 shrink-0 text-brand" aria-hidden />
          <span className="text-muted-foreground">Delivering to</span>
          <span className="truncate font-semibold text-foreground">
            {postcode.toUpperCase()}
          </span>
        </div>
        <button
          type="button"
          onClick={handleChange}
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Change
        </button>
      </div>
    </div>
  );
}
