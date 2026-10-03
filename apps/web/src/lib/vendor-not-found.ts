/**
 * Resolve a missing vendor before the App Router can flush a loading shell.
 * Only a definite API 404 is absence; outages must retain their error path.
 */
export async function isMissingVendorProfile(
  pathname: string,
  apiOrigin: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const match = /^\/vendors\/([^/]+)\/?$/.exec(pathname);
  if (!match) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const slug = encodeURIComponent(decodeURIComponent(match[1]!));
    const upstream = await fetcher(`${apiOrigin}/v1/vendors/${slug}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    const missing = upstream.status === 404;
    await upstream.body?.cancel().catch(() => undefined);
    return missing;
  } catch {
    // Let the page's normal API error handling report network/timeout failures.
    return false;
  } finally {
    clearTimeout(timer);
  }
}
