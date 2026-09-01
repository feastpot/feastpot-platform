import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { TestIdentity } from '../../../../scripts/test-factory';

export const VENDOR_MATRIX_STATES = [
  'V1',
  'V2',
  'V3',
  'V4',
  'V5',
  'V6',
  'V7',
  'V8',
  'V9',
  'V10',
  'V11',
] as const;

export type VendorMatrixState = (typeof VENDOR_MATRIX_STATES)[number];

export type VendorStateMatrixManifest = {
  namespace: string;
  identities: Record<VendorMatrixState, TestIdentity>;
};

export type VendorRoute = {
  label: string;
  href: (identity: TestIdentity) => string;
  expectsPortalShell: boolean;
};

function safeNamespace(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function matrixNamespace(): string {
  return process.env.TEST_FACTORY_NAMESPACE ?? 'vendor-route-matrix';
}

export function configuredMatrixStates(): readonly VendorMatrixState[] {
  const configured = process.env.E2E_VENDOR_MATRIX_STATES;
  if (!configured) return VENDOR_MATRIX_STATES;

  const states = configured
    .split(',')
    .map((state) => state.trim().toUpperCase())
    .filter(Boolean);

  if (
    states.length === 0 ||
    states.some(
      (state): state is string => !VENDOR_MATRIX_STATES.includes(state as VendorMatrixState),
    )
  ) {
    throw new Error(
      `E2E_VENDOR_MATRIX_STATES must contain only ${VENDOR_MATRIX_STATES.join(', ')}, received "${configured}".`,
    );
  }

  return [...new Set(states)] as VendorMatrixState[];
}

function matrixDirectory(namespace = matrixNamespace()): string {
  const directory = join(tmpdir(), 'feastpot-vendor-state-matrix', safeNamespace(namespace));
  mkdirSync(directory, { recursive: true });
  return directory;
}

export function matrixManifestPath(namespace = matrixNamespace()): string {
  return join(matrixDirectory(namespace), 'manifest.json');
}

export function matrixStorageStatePath(
  state: VendorMatrixState,
  namespace = matrixNamespace(),
): string {
  return join(matrixDirectory(namespace), `${state.toLowerCase()}.json`);
}

export function matrixBusinessName(state: VendorMatrixState): string {
  return `Test Factory ${state} Kitchen`;
}

const missingId = (kind: string) => `matrix-missing-${kind}`;

/**
 * Route inventory for every vendor-facing screen. Auth callback is deliberately
 * absent because it is a route handler, not a renderable portal screen.
 */
export const VENDOR_PORTAL_ROUTES: readonly VendorRoute[] = [
  { label: 'dashboard', href: () => '/', expectsPortalShell: true },
  {
    label: 'account and compliance',
    href: () => '/account-and-compliance',
    expectsPortalShell: true,
  },
  { label: 'account status redirect', href: () => '/account-status', expectsPortalShell: true },
  { label: 'analytics redirect', href: () => '/analytics', expectsPortalShell: true },
  { label: 'availability', href: () => '/availability', expectsPortalShell: true },
  { label: 'password reset start', href: () => '/auth/reset/start', expectsPortalShell: false },
  { label: 'password reset update', href: () => '/auth/reset/update', expectsPortalShell: false },
  { label: 'catering redirect', href: () => '/catering', expectsPortalShell: true },
  { label: 'new catering quote', href: () => '/catering/new', expectsPortalShell: true },
  {
    label: 'catering quote detail',
    href: (identity) => `/catering/${identity.cateringBookingId ?? missingId('booking')}/quote`,
    expectsPortalShell: true,
  },
  { label: 'compliance redirect', href: () => '/compliance', expectsPortalShell: true },
  { label: 'disputes', href: () => '/disputes', expectsPortalShell: true },
  {
    label: 'dispute detail',
    href: (identity) => `/disputes/${identity.disputeId ?? missingId('dispute')}`,
    expectsPortalShell: true,
  },
  { label: 'earnings redirect', href: () => '/earnings', expectsPortalShell: true },
  { label: 'events', href: () => '/events', expectsPortalShell: true },
  {
    label: 'event quote',
    href: () => `/events/${missingId('event')}/quote`,
    expectsPortalShell: true,
  },
  { label: 'forgot password', href: () => '/forgot-password', expectsPortalShell: false },
  { label: 'help', href: () => '/help', expectsPortalShell: true },
  { label: 'menu', href: () => '/menu', expectsPortalShell: true },
  {
    label: 'legacy menu redirect',
    href: () => `/menu/${missingId('menu')}`,
    expectsPortalShell: true,
  },
  {
    label: 'legacy menu item redirect',
    href: () => `/menu/${missingId('menu')}/items/${missingId('item')}`,
    expectsPortalShell: true,
  },
  { label: 'notifications', href: () => '/notifications', expectsPortalShell: true },
  { label: 'onboarding', href: () => '/onboarding', expectsPortalShell: true },
  {
    label: 'onboarding registration',
    href: () => '/onboarding/register',
    expectsPortalShell: false,
  },
  { label: 'onboarding terms', href: () => '/onboarding/terms', expectsPortalShell: true },
  { label: 'onboarding welcome', href: () => '/onboarding/welcome', expectsPortalShell: true },
  { label: 'orders', href: () => '/orders', expectsPortalShell: true },
  {
    label: 'order detail',
    href: (identity) => `/orders/${identity.orderId ?? missingId('order')}`,
    expectsPortalShell: true,
  },
  { label: 'payouts', href: () => '/payouts', expectsPortalShell: true },
  { label: 'performance', href: () => '/performance', expectsPortalShell: true },
  { label: 'referrals redirect', href: () => '/referrals', expectsPortalShell: true },
  { label: 'close account', href: () => '/settings/close-account', expectsPortalShell: true },
  { label: 'delivery settings', href: () => '/settings/delivery', expectsPortalShell: true },
  { label: 'profile settings', href: () => '/settings/profile', expectsPortalShell: true },
  { label: 'security settings', href: () => '/settings/security', expectsPortalShell: true },
  { label: 'team settings', href: () => '/settings/team', expectsPortalShell: true },
  { label: 'share', href: () => '/share', expectsPortalShell: true },
  { label: 'sign in', href: () => '/sign-in', expectsPortalShell: false },
  { label: 'tax information', href: () => '/tax-information', expectsPortalShell: true },
  { label: 'terms redirect', href: () => '/terms', expectsPortalShell: true },
  { label: 'unauthorized', href: () => '/unauthorized', expectsPortalShell: false },
  { label: 'user guide', href: () => '/user-guide', expectsPortalShell: true },
];
