/**
 * Centralised env access for the vendor portal. The default API URL targets
 * the Replit dev server on port 3001; production must set NEXT_PUBLIC_API_URL.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
