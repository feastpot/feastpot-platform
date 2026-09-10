/**
 * The single source of truth for staff navigation and server-route access.
 * Keep deep links in this inventory even when they are not sidebar entries:
 * the guide links to these anchors and browser authorization coverage must not
 * silently omit them.
 */
export const STAFF_ROLES = ['admin', 'support', 'finance', 'compliance'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ADMIN_DESTINATION_ROLES = {
  '/': STAFF_ROLES,
  '/orders': ['admin', 'support', 'finance'],
  '/disputes': ['admin', 'support'],
  '/chargebacks': ['admin', 'finance'],
  '/catering': ['admin', 'support', 'finance'],
  '/supply-pipeline': ['admin', 'compliance', 'support'],
  '/compliance': ['admin', 'compliance'],
  '/menus/queue': ['admin'],
  '/reviews/queue': ['admin'],
  '/payouts': ['admin', 'finance'],
  '/commission-rates': ['admin', 'finance'],
  '/discount-codes': ['admin', 'finance'],
  '/feastpass-health': ['admin', 'finance'],
  '/analytics': ['admin', 'finance', 'support'],
  '/vendor-acquisition': ['admin', 'finance', 'support'],
  '/attribution': ['admin', 'finance', 'support'],
  '/coverage': ['admin', 'support'],
  '/push/compose': ['admin'],
  '/legal': ['admin', 'compliance'],
  '/audit-log': ['admin', 'compliance'],
  '/dead-letters': ['admin'],
  '/queues': ['admin'],
  '/settings': ['admin'],
  '/users': STAFF_ROLES,
  '/user-guide': STAFF_ROLES,
  // Legacy entry points intentionally remain in the access inventory. They
  // redirect to a canonical destination but still have a filesystem route and
  // therefore must be protected before their redirect is evaluated.
  '/catering-bookings': ['admin', 'support', 'finance'],
  '/catering-enquiries': ['admin', 'support', 'finance'],
  '/events': ['admin', 'support', 'finance'],
  '/notifications': ['admin'],
  '/vendor-applications': ['admin', 'compliance', 'support'],
  '/vendors': ['admin', 'compliance', 'support'],
  // Non-sidebar operational pages.
  '/error-incidents': STAFF_ROLES,
  '/vendor-recommendations': ['admin', 'support'],
  '/waitlist': ['admin', 'support'],
  // Legal sub-sections are independently addressable from legal workflows.
  '/legal/appeals': ['admin', 'compliance', 'support'],
  '/legal/coverage': ['admin', 'compliance', 'support'],
  '/legal/documents': ['admin', 'compliance'],
  '/legal/enforcement': ['admin', 'compliance'],
  '/legal/evidence': ['admin', 'compliance'],
  '/legal/notices': ['admin', 'compliance', 'support'],
  // Parameterised pages use factory IDs in browser coverage; keeping their
  // route patterns here avoids hiding them behind a representative list route.
  '/disputes/:factoryDisputeId': ['admin', 'support'],
  '/events/:factoryEnquiryId': ['admin', 'support'],
  '/legal/documents/:factoryDocumentId': ['admin', 'compliance'],
  '/vendor-applications/:factoryVendorApplicationId': ['admin', 'compliance', 'support'],
  '/vendors/:factoryVendorId': ['admin', 'compliance', 'support'],
  // Canonical tabs/deep links are destinations in their own right because
  // operational runbooks link directly to them.
  '/catering?tab=bookings': ['admin', 'support', 'finance'],
  '/catering?tab=enquiries': ['admin', 'support', 'finance'],
  '/dead-letters?tab=notifications': ['admin'],
  '/settings/2fa': STAFF_ROLES,
} as const satisfies Record<string, readonly StaffRole[]>;

export type AdminDestination = keyof typeof ADMIN_DESTINATION_ROLES;

/** Filesystem pages deliberately outside the protected admin destination map. */
export const ADMIN_ROUTE_EXCLUSIONS = {
  '/sign-in': 'Public authentication entry point.',
  '/unauthorized': 'Public denial page used by server gates.',
} as const;

/** The documented User Guide route inventory (hashes are real in-page links). */
export const USER_GUIDE_SECTION_IDS = [
  'roles',
  'dashboard',
  'orders',
  'vendors',
  'compliance',
  'disputes',
  'catering',
  'finance',
  'content-moderation',
  'attribution',
  'coverage',
  'job-queues',
  'settings',
] as const;
export type UserGuideSectionId = (typeof USER_GUIDE_SECTION_IDS)[number];
export const USER_GUIDE_DEEP_LINKS = USER_GUIDE_SECTION_IDS.map(
  (id) => `#${id}` as `#${UserGuideSectionId}`,
);

export const ADMIN_DESTINATION_MATRIX = [
  ...Object.entries(ADMIN_DESTINATION_ROLES).map(([pathname, allowedRoles]) => ({
    pathname: pathname as AdminDestination,
    allowedRoles,
  })),
  ...USER_GUIDE_DEEP_LINKS.map((hash) => ({
    pathname: `/user-guide${hash}`,
    allowedRoles: ADMIN_DESTINATION_ROLES['/user-guide'],
  })),
] as const;

export function rolesForAdminDestination(pathname: string): readonly StaffRole[] | undefined {
  return ADMIN_DESTINATION_ROLES[pathname as AdminDestination];
}
