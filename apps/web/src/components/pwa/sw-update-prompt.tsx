'use client';

import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Surfaces a "new version available" toast when Workbox installs an updated
 * service worker in the background.
 *
 * Why this exists: `next.config.mjs` sets `skipWaiting: true` + `clientsClaim:
 * true`, which means a refreshed SW takes control on the next navigation
 * without asking. That's great for hot-fixing bugs but the in-flight tab keeps
 * running the OLD bundle until the user navigates. This component listens for
 * the `installed` -> `controlled` transition and gives the user a one-tap
 * "Update" that calls `window.location.reload()` so they pick up the new
 * code without having to hunt for the refresh button.
 *
 * Pinned above the bottom-nav using the same `safe-area-inset-bottom` math
 * the nav uses, so it never sits under the iOS home indicator.
 */
export function SWUpdatePrompt() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    navigator.serviceWorker.ready
      .then((registration) => {
        if (cancelled) return;
        // Surface a SW that's already finished installing before this
        // component mounted (e.g. updated during a previous tab session).
        if (registration.waiting && navigator.serviceWorker.controller) {
          setUpdateAvailable(true);
        }
        const handleUpdateFound = () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            // `installed` + an existing controller == a new SW is sitting in
            // the wings waiting to take over. (No controller would mean this
            // is the FIRST SW install — nothing to "update" from.)
            if (
              newWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              setUpdateAvailable(true);
            }
          });
        };
        registration.addEventListener('updatefound', handleUpdateFound);
        cleanup = () =>
          registration.removeEventListener('updatefound', handleUpdateFound);
      })
      .catch(() => {
        /* SW registration failed — nothing to prompt about */
      });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-3 right-3 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-foreground px-4 py-3 text-white shadow-lg"
      style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}
    >
      <span className="flex items-center gap-2 text-sm">
        <RefreshCw className="h-4 w-4" aria-hidden />
        New version available
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold hover:bg-brand-dark"
      >
        Update
      </button>
    </div>
  );
}
