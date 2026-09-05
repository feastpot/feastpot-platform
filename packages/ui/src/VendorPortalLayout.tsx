import type { ReactNode } from 'react';

// ── Page header ──────────────────────────────────────────────────────────────

export interface VendorBreadcrumbItem {
  label: string;
  href: string;
}

export interface VendorPageHeaderProps {
  title: string;
  description?: string;
  /** Icon node rendered inside the teal rounded-xl tile. */
  icon?: ReactNode;
  /** Breadcrumb trail. The last item is the current page (not linked). */
  breadcrumb?: VendorBreadcrumbItem[];
  /** Action slot: primary CTA or Cancel button rendered top-right. */
  action?: ReactNode;
}

/**
 * Consistent page header used across every vendor portal route.
 * Renders an optional breadcrumb, then a title + description row with an
 * optional icon tile and an action slot (e.g. a Cancel button).
 *
 * Uses plain <a> anchors so it can be imported from packages/ui without
 * taking a Next.js peer dependency.
 */
export function VendorPageHeader({
  title,
  description,
  icon,
  breadcrumb,
  action,
}: VendorPageHeaderProps) {
  return (
    <div className="mb-6">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav
          aria-label="Breadcrumb"
          className="mb-3 flex flex-wrap items-center gap-1 text-xs text-mid"
        >
          {breadcrumb.map((crumb, i) => (
            <span key={crumb.href} className="flex items-center gap-1">
              {i > 0 && (
                <span aria-hidden className="select-none text-mid/50">
                  /
                </span>
              )}
              <a href={crumb.href} className="hover:text-dark hover:underline">
                {crumb.label}
              </a>
            </span>
          ))}
          {/* Current page (non-linked) */}
          <span className="flex items-center gap-1">
            <span aria-hidden className="select-none text-mid/50">
              /
            </span>
            <span className="font-medium text-dark">{title}</span>
          </span>
        </nav>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          {icon && (
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal/10"
              aria-hidden
            >
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-dark">{title}</h1>
            {description && <p className="mt-1 text-sm text-mid">{description}</p>}
          </div>
        </div>

        {action && <div className="w-full shrink-0 sm:w-auto">{action}</div>}
      </div>
    </div>
  );
}

// ── Layout shell ─────────────────────────────────────────────────────────────

export interface VendorPortalLayoutProps {
  /**
   * Mobile top bar : rendered inside a `md:hidden` wrapper so it disappears
   * on desktop where the sidebar takes over navigation.
   */
  topNav: ReactNode;
  /**
   * Desktop left-rail sidebar : rendered as a sibling of <main> inside the
   * full-height flex row.
   */
  sideNav: ReactNode;
  children: ReactNode;
  /**
   * Content column max-width:
   * - `"standard"` : 1 100 px for list / dashboard pages (default)
   * - `"form"`     : 760 px for form-first pages such as /catering/new
   *                  and /tax-information
   */
  maxWidth?: 'standard' | 'form';
}

/**
 * Single layout shell for every vendor portal route.
 *
 * Renders:
 *   [mobile top nav : md:hidden]
 *   [full-height flex row]
 *     [left sidebar : hidden on mobile]
 *     [<main>]
 *       [content column : max-width + consistent 16/24 px gutters]
 *         {children}
 *
 * No colours are defined here. Structure only.
 */
export function VendorPortalLayout({
  topNav,
  sideNav,
  children,
  maxWidth = 'standard',
}: VendorPortalLayoutProps) {
  const contentMaxWidth = maxWidth === 'form' ? 'max-w-[760px]' : 'max-w-[1100px]';

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden">{topNav}</div>

      {/* Sidebar + content row */}
      <div className="flex min-h-screen bg-surface">
        {sideNav}

        {/* Content region : overflow-x-hidden prevents horizontal scroll at
            375 px when any inner element slightly exceeds the viewport. */}
        <main className="min-w-0 flex-1 overflow-x-hidden">
          {/* Content column: left-aligned (no mx-auto), bounded by maxWidth */}
          <div className={`w-full ${contentMaxWidth} px-4 py-6 md:px-6`}>{children}</div>
        </main>
      </div>
    </>
  );
}
