/**
 * Centralised env access for the vendor portal. The default API URL targets
 * the Replit dev server on port 3001; production must set NEXT_PUBLIC_API_URL.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Public customer storefront base URL. Used for "preview your menu" links
 * (T008) and any other deep links from the vendor portal back to the
 * customer site. Defaults to the local Next dev server on port 3000.
 */
export const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';
