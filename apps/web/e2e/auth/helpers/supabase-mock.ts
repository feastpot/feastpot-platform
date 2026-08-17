/**
 * Shared Supabase response factories for page.route() interceptors.
 *
 * All tests in the auth suite use mock Supabase responses so they:
 *  - run deterministically without rate-limit risk
 *  - never touch real user data
 *  - complete quickly (no network round-trips)
 *
 * Tests requiring real email delivery are gated on TEST_MAILOSAUR_API_KEY
 * and documented in MANUAL-AUTH-TESTS.md.
 */

import type { Page, Route } from '@playwright/test';
import { SB, API } from './selectors';

// ---------------------------------------------------------------------------
// Session payloads
// ---------------------------------------------------------------------------

export function mockSession(email = 'test@example.com') {
  return {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: 'mock-user-id',
      aud: 'authenticated',
      role: 'authenticated',
      email,
      email_confirmed_at: new Date().toISOString(),
      phone: '',
      confirmed_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { firstName: 'Amara', lastName: 'Okafor' },
      identities: [{ id: 'mock-user-id', provider: 'email', identity_data: { email } }],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Sign-up response builders
// ---------------------------------------------------------------------------

/** New user: identities populated, no session, confirmation pending. */
export function signupNewUser(email: string) {
  return {
    id: 'new-user-id',
    email,
    identities: [{ id: 'new-user-id', provider: 'email', identity_data: { email } }],
    confirmation_sent_at: new Date().toISOString(),
    session: null,
  };
}

/** Existing CONFIRMED user: Supabase obfuscates with empty identities, no session. */
export function signupConfirmedUser(email: string) {
  return { id: 'existing-user-id', email, identities: [], session: null };
}

/** Existing UNCONFIRMED user: identities non-empty, no session. */
export function signupUnconfirmedUser(email: string) {
  return {
    id: 'unconfirmed-user-id',
    email,
    identities: [{ id: 'unconfirmed-user-id', provider: 'email', identity_data: { email } }],
    confirmation_sent_at: new Date().toISOString(),
    session: null,
  };
}

// ---------------------------------------------------------------------------
// Error payloads
// ---------------------------------------------------------------------------

export const ERRORS = {
  invalidCredentials: {
    code: 400,
    error_code: 'invalid_credentials',
    msg: 'Invalid login credentials',
  },
  emailNotConfirmed: {
    code: 400,
    error_code: 'email_not_confirmed',
    msg: 'Email not confirmed',
  },
  otpExpired: {
    code: 401,
    error_code: 'otp_expired',
    msg: 'Token has expired or is invalid',
  },
  rateLimited: {
    code: 429,
    error_code: 'over_email_send_rate_limit',
    msg: 'Email rate limit exceeded',
  },
  weakPassword: {
    code: 422,
    error_code: 'weak_password',
    msg: 'Password has appeared in a data breach.',
    weak_password: { reasons: ['pwned'] },
  },
} as const;

// ---------------------------------------------------------------------------
// Convenience interceptors
// ---------------------------------------------------------------------------

/** Mock Supabase signup to return a given body. */
export async function mockSignup(page: Page, body: object, status = 200) {
  await page.route(SB.signup, (route: Route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

/** Mock Supabase sign-in (token endpoint) to return a session or error. */
export async function mockSignin(page: Page, body: object, status = 200) {
  await page.route(SB.token, (route: Route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

/** Mock Supabase OTP verify (used by /auth/confirm). */
export async function mockVerifyOtp(page: Page, body: object, status = 200) {
  await page.route(SB.verify, (route: Route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

/** Mock Supabase resend. */
export async function mockResend(page: Page, body: object, status = 200) {
  await page.route(SB.resend, (route: Route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

/** Mock the internal /v1/auth/reset-request endpoint. */
export async function mockResetRequest(page: Page, status = 200) {
  await page.route(API.resetRequest, (route: Route) =>
    route.fulfill({ status, contentType: 'application/json', body: '{}' }),
  );
}

/** Silently absorb /v1/users/sync so sign-in tests don't fail on the API call. */
export async function mockUsersSync(page: Page) {
  await page.route(API.usersSync, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
}
