'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { readStoredPostcode, writeCoverageCookie, writeStoredPostcode } from '@/lib/postcode';

export function usePostcodeUrlSync(postcode: string | undefined): boolean {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const synced = useRef(false);
  const [resolved, setResolved] = useState(!!postcode);

  useEffect(() => {
    // Search params can change before the old page unmounts during navigation.
    // Never restore a missing postcode into a destination vendor route.
    if (pathname !== '/vendors') return;
    const initialSync = !synced.current;
    synced.current = true;
    if (postcode) {
      writeStoredPostcode(postcode);
      writeCoverageCookie(postcode);
      setResolved(true);
      return;
    }
    const saved = initialSync ? readStoredPostcode() : null;
    if (!saved) {
      setResolved(true);
      return;
    }
    const next = new URLSearchParams(params?.toString() ?? '');
    next.set('postcode', saved);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [params, pathname, postcode, router]);

  return resolved;
}
