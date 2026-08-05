/**
 * Geography scope config for the Feastpot marketplace.
 *
 * All customer-facing copy referencing scope or location must derive from
 * these constants -- never hardcode city/region names inline. A test in
 * __tests__/geography-guard.test.ts enforces that no literal 'London'
 * appears in apps/web/src outside this file.
 */

export const MARKETPLACE_SCOPE = 'United Kingdom';

export const LAUNCH_FOCUS = {
  city: 'London',
  borough: 'Southwark',
  districts: ['SE15', 'SE5', 'SE22'],
} as const;

/** One-line scope line for generic customer-facing copy. */
export const nationalCoverageLine = () => 'Trusted local cooks across the UK';

/** One-line onboarding / launch scope line. */
export const launchFocusLine = () => 'Now onboarding cooks across the UK, starting in south London';
