/**
 * Open-redirect guard for post-auth (`?next=`) destinations.
 *
 * An attacker who can pick the `next` parameter on a phishing link
 * (`/sign-in?next=https://evil.example`) would otherwise land the victim on
 * a clone the moment the legitimate sign-in succeeds - and the URL bar
 * still shows our own domain right up until the redirect fires, which
 * makes the lure highly convincing.
 *
 * We refuse anything that isn't an unambiguous internal path:
 *   - must start with a single `/`
 *   - must NOT start with `//` (protocol-relative → `//evil.example/x`
 *     becomes `https://evil.example/x` in the browser)
 *   - must NOT contain `..` (path traversal trickery, plus it's never
 *     something a legitimate caller needs)
 *   - must NOT contain `\` (some browsers normalise backslashes to `/`,
 *     so `/\evil.example` can collapse to `//evil.example`)
 *   - capped at 200 chars to keep the URL line short and to deny
 *     attempts at smuggling a giant payload through the query string
 *
 * Anything that fails the check silently falls back to `fallback` (default
 * `/`) - we never echo the attacker's input back as an error message.
 */
export function safeRedirect(next: string | null, fallback = '/'): string {
  if (!next) return fallback;
  if (!next.startsWith('/') || next.startsWith('//')) return fallback;
  if (next.includes('..') || next.includes('\\')) return fallback;
  if (next.length > 200) return fallback;
  return next;
}
