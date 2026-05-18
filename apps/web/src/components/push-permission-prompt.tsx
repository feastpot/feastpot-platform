'use client';

import { Bell, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useAccessToken } from '@/lib/auth/use-access-token';
import {
  dismissPrompt,
  getPushSupport,
  isPromptDismissed,
  registerPushSubscription,
} from '@/lib/push';

interface Props {
  /**
   * The component is mounted everywhere but only renders itself once an
   * order has been placed. Pages that finish a checkout can flip this via
   * `localStorage.setItem('feastpot.has-ordered.v1', '1')` - the prompt
   * picks it up on next render. Default: read from localStorage.
   */
  forceShow?: boolean;
}

/**
 * Tiny floating prompt asking the customer for notification permission. We
 * deliberately gate on "user has placed at least one order" instead of
 * showing it on first visit - most browsers permanently block our origin
 * after a single decline, so we only ask when the value is highest.
 *
 * Dismissal is sticky (localStorage) so the user isn't pestered.
 */
export function PushPermissionPrompt({ forceShow = false }: Props) {
  const { token } = useAccessToken();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isPromptDismissed()) return;

    const support = getPushSupport();
    // Only ask when push is actually available AND the user hasn't decided yet.
    if (support !== 'default') return;

    let hasOrdered = forceShow;
    if (!hasOrdered) {
      try {
        hasOrdered = localStorage.getItem('feastpot.has-ordered.v1') === '1';
      } catch {
        /* ignore */
      }
    }
    if (!hasOrdered) return;
    setVisible(true);
  }, [forceShow]);

  if (!visible) return null;

  const onEnable = async () => {
    if (!token) {
      setError('Sign in first to enable notifications.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await registerPushSubscription(token);
      dismissPrompt();
      setVisible(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not enable notifications.');
    } finally {
      setBusy(false);
    }
  };

  const onDismiss = () => {
    dismissPrompt();
    setVisible(false);
  };

  return (
    <aside
      role="dialog"
      aria-label="Enable notifications"
      className="fixed inset-x-0 bottom-20 z-30 mx-auto max-w-md px-4"
    >
      <div className="relative rounded-2xl border border-cream-deep bg-white p-4 shadow-xl">
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="absolute right-2 top-2 rounded-full p-1 text-charcoal-mid hover:bg-cream"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white">
            <Bell className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-sm font-black text-charcoal">Get notified when your order is ready?</h3>
            <p className="mt-0.5 text-xs font-medium text-charcoal-mid">
              We&rsquo;ll only ping you about your order - no marketing.
            </p>
            {error && <p className="mt-2 text-xs font-medium text-scotch">{error}</p>}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={onEnable}
                disabled={busy}
                className="rounded-xl bg-brand px-3 py-2 text-xs font-bold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                {busy ? 'Enabling…' : 'Enable notifications'}
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-xl border border-cream-deep bg-white px-3 py-2 text-xs font-bold text-charcoal hover:bg-cream"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
