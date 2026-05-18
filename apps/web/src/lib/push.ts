'use client';

import { apiRequest } from '@/lib/api/client';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PROMPT_DISMISSED_KEY = 'feastpot.push.dismissed.v1';

/**
 * Browser-API-compatible base64url → Uint8Array. Required because
 * `applicationServerKey` is the *raw* key bytes, but VAPID public keys are
 * normally distributed as base64url strings.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushSupport =
  | 'unsupported'
  | 'denied'
  | 'granted'
  | 'default'
  | 'no-vapid-key';

/** Probes (no side effects) what the browser will allow us to do. */
export function getPushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  if (!VAPID_PUBLIC_KEY) return 'no-vapid-key';
  return Notification.permission as PushSupport;
}

export function isPromptDismissed(): boolean {
  try {
    return localStorage.getItem(PROMPT_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissPrompt(): void {
  try {
    localStorage.setItem(PROMPT_DISMISSED_KEY, '1');
  } catch {
    /* private mode - ignore */
  }
}

/**
 * Asks the OS for notification permission, gets a Web Push subscription off
 * the active SW registration, and forwards it to the API.
 *
 * Throws on:
 *  - missing VAPID key (env misconfig)
 *  - user denying permission
 *  - SW not registered (next-pwa is disabled in dev - push only works in prod)
 *
 * Returns the `PushSubscription` so callers can persist its endpoint locally
 * if they want to support an explicit "Disable notifications" toggle later.
 */
export async function registerPushSubscription(accessToken: string): Promise<PushSubscription> {
  if (!VAPID_PUBLIC_KEY) {
    throw new Error('Push is not configured (missing NEXT_PUBLIC_VAPID_PUBLIC_KEY).');
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Your browser doesn’t support push notifications.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  const reg = await navigator.serviceWorker.ready;
  // Reuse existing subscription where possible - re-subscribing rotates the
  // endpoint and would orphan the previous server-side row until it 410s.
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast: PushManager wants `BufferSource` typed against ArrayBuffer
      // specifically; Uint8Array under TS 5.6 lib.dom is generic over
      // ArrayBufferLike (incl. SharedArrayBuffer). The runtime accepts it.
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
    });
  }

  // `toJSON()` gives us `{ endpoint, keys: { p256dh, auth }, … }` exactly as
  // the API DTO expects.
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Subscription is missing endpoint or keys.');
  }

  await apiRequest('/push/subscribe', {
    method: 'POST',
    body: {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    },
    accessToken,
  });

  return sub;
}

/** Best-effort unsubscribe - runs both client-side and server-side cleanup. */
export async function unregisterPushSubscription(accessToken: string): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;

  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => undefined);
  try {
    await apiRequest('/push/unsubscribe', {
      method: 'DELETE',
      query: { endpoint },
      accessToken,
    });
  } catch {
    // Silent - the local unsubscribe already happened, server row will time
    // out on next push attempt with a 410.
  }
}
