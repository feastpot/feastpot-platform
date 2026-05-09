/**
 * Centralised env access. Throw early if a required public var is missing
 * — better than a confusing CORS / 404 storm later. The default API URL
 * targets the Replit dev server on port 3001; production should set
 * NEXT_PUBLIC_API_URL explicitly.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
