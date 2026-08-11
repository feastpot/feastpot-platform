/**
 * Open-redirect guard for post-auth (`?next=`) destinations.
 *
 * Mirrors apps/web/src/lib/safe-redirect.ts (keep in sync).
 *
 * An attacker who can pick the `next` parameter on a phishing link
 * (`/sign-in?next=https://evil.example`) would otherwise land the victim on
 * a clone the moment the legitimate sign-in succeeds - and the URL bar
 * still shows our own domain right up until the redirect fires, which
 * makes the lure highly convincing.
 *
 * We refuse anything that isn't an unambiguous internal path:
 *   - must start with a single `/`
 *   - must NOT start with `//` (protocol-relative → `//evil.example/x`)
 *   - must NOT contain `..` (path traversal trickery)
 *   - must NOT contain `\` (some browsers normalise backslashes to `/`)
 *   - capped at 200 chars
 *
 * Anything that fails the check silently falls back to `fallback` (default
 * `/orders`) - we never echo the attacker's input back as an error message.
 */
export function safeRedirect(next: string | null, fallback = '/orders'): string {
  if (!next) return fallback;
  if (!next.startsWith('/') || next.startsWith('//')) return fallback;
  if (next.includes('..') || next.includes('\\')) return fallback;
  if (next.length > 200) return fallback;
  return next;
}
