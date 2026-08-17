/**
 * Centralised selectors and URL constants for the auth test suite.
 * Update here when the UI changes rather than across every spec file.
 */

export const URLS = {
  signIn: '/sign-in',
  register: '/sign-in?mode=register',
  forgotPassword: '/forgot-password',
  authConfirm: '/auth/confirm',
  authCallback: '/auth/callback',
  home: '/',
} as const;

/** Register form field IDs */
export const REG = {
  fullName: '#reg-fullName',
  email: '#reg-email',
  phone: '#reg-phone',
  password: '#reg-password',
  confirmPassword: '#reg-confirmPassword',
  postcode: '#reg-postcode',
  terms: 'input[type=checkbox][name=termsAccepted]',
  submit: 'button[type=submit]',
} as const;

/** Sign-in form field IDs */
export const SIGNIN = {
  email: '#signin-email',
  password: '#signin-password',
  submit: 'button[type=submit]',
} as const;

/** Forgot-password form */
export const FORGOT = {
  email: '#email',
  submit: 'button[type=submit]',
} as const;

/** Supabase network endpoint globs (for page.route interception) */
export const SB = {
  signup: '**/auth/v1/signup',
  token: '**/auth/v1/token*',
  resend: '**/auth/v1/resend',
  verify: '**/auth/v1/verify',
  otp: '**/auth/v1/otp*',
  authorize: '**/auth/v1/authorize*',
  user: '**/auth/v1/user',
} as const;

/** Internal API endpoint globs */
export const API = {
  resetRequest: '**/v1/auth/reset-request',
  usersSync: '**/v1/users/sync',
} as const;

/** Minimal valid register form values */
export const VALID_REG = {
  fullName: 'Amara Okafor',
  email: `test+${Date.now()}@example-feastpot.com`,
  password: 'StrongPass1!',
  postcode: 'E1 6RF',
} as const;
