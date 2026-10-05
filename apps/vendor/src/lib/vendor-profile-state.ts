import { ApiError } from './api/client';

/** Missing onboarding data is not a failed authentication or a forbidden team role. */
export function isMissingVendorProfile(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 404 || (error.status === 403 && error.code === 'NOT_VENDOR_MEMBER'))
  );
}
